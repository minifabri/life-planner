import { addDays, startOfLocalDay, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import { deterministicId, uuidv7 } from "../ids";
import { toEventInput, toExceptionInputs, toTaskInput, type ImportItem } from "../import/ics";
import { datesToMaterialize, nextAfterCompletion } from "../recurrence/expand";
import { reminderRemovedOps, reminderRestoredOps, reminderToggledOps } from "../meals/rules";
import { getSupabase } from "../supabase/client";
import { commit, withPendingEvents, withPendingRecurrences, withPendingTasks } from "../sync/engine";
import { byId, type DayEvents, type Op, type Row, type Table } from "../sync/ops";
import { completePatch, reopenPatch } from "../tasks/actions";
import { queryClient } from "./query-client";
import type {
  Area,
  EventException,
  EventRow,
  List,
  LogCategory,
  Profile,
  Recurrence,
  RecurrenceTemplate,
  Task,
} from "../supabase/types";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const PROFILE_COLUMNS =
  "owner_id, display_name, timezone, theme, evening_review_time, morning_overview_time, quiet_start, quiet_end, meal_prep_reminder_time, " +
  "notify_medium, notify_high, quiet_allow_high, notify_meal_prep, notify_morning, notify_evening, weather_city, weather_lat, weather_lon";

export async function fetchProfile(): Promise<Profile | null> {
  return check(await getSupabase().from("profiles").select(PROFILE_COLUMNS).maybeSingle());
}

export async function fetchAreas(): Promise<Area[]> {
  return check(await getSupabase().from("areas").select("*").is("archived_at", null).order("sort_order"));
}

/**
 * Attività utili alle viste da `day` a `to` (un giorno, una settimana, un mese): tutte quelle aperte
 * (per rimaste indietro e nel periodo), quelle dei giorni richiesti in qualsiasi stato e quelle completate dal primo giorno in poi.
 */
export async function fetchTasks(day: LocalDate, tz: string, to: LocalDate = day): Promise<Task[]> {
  const dayStart = startOfLocalDay(day, tz).toISOString();
  return withPendingTasks(
    check(
      await getSupabase()
        .from("tasks")
        .select("*")
        .is("deleted_at", null)
        .or(`status.eq.open,and(date.gte.${day},date.lte.${to}),completed_at.gte."${dayStart}"`),
    ),
  );
}

export type { DayEvents };

/** Eventi che possono toccare i giorni da `day` a `to`: quelli vicini, quelli di tutto il giorno recenti e tutte le serie. */
export async function fetchEvents(day: LocalDate, tz: string, to: LocalDate = day): Promise<DayEvents> {
  const supabase = getSupabase();
  const from = startOfLocalDay(addDays(day, -7), tz).toISOString();
  const until = startOfLocalDay(addDays(to, 1), tz).toISOString();
  const events: EventRow[] = check(
    await supabase
      .from("events")
      .select("*")
      .is("deleted_at", null)
      .or(
        `rrule.not.is.null,and(start_at.gte."${from}",start_at.lt."${until}"),and(all_day.is.true,start_date.lte.${to},start_date.gte.${addDays(day, -60)})`,
      ),
  );
  const recurring = events.filter((e) => e.rrule).map((e) => e.id);
  const exceptions: EventException[] = recurring.length
    ? check(await supabase.from("event_exceptions").select("*").in("event_id", recurring))
    : [];
  return withPendingEvents({ events, exceptions }, day, tz, to);
}

/** Tutte le ricorrenze: sono poche e servono anche senza rete, per creare la prossima attività. */
export async function fetchRecurrences(): Promise<Recurrence[]> {
  return withPendingRecurrences(check(await getSupabase().from("recurrences").select("*")));
}

const recurrencesQuery = { queryKey: ["recurrences"], queryFn: fetchRecurrences, staleTime: 5 * 60_000 };
const listsQuery = { queryKey: ["lists"], queryFn: fetchLists, staleTime: Infinity };

/** Scaricate all'apertura, così sono già in cache quando la rete manca. */
export function prefetchReferenceData() {
  void queryClient.prefetchQuery(recurrencesQuery);
  void queryClient.prefetchQuery(listsQuery);
}

async function findRecurrence(id: string): Promise<Recurrence | null> {
  try {
    return (await queryClient.ensureQueryData(recurrencesQuery)).find((r) => r.id === id) ?? null;
  } catch {
    return null;
  }
}

export type TaskInput = Pick<
  Task,
  "title" | "notes" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "attention" | "area_id"
> &
  Partial<Pick<Task, "remind">>;

export type RepeatInput =
  | { kind: "none" }
  | { kind: "fixed"; rrule: string; until?: LocalDate | null }
  | { kind: "after_completion"; intervalDays: number; until?: LocalDate | null };

function templateFrom(input: TaskInput, startDate: LocalDate): RecurrenceTemplate {
  return {
    title: input.title,
    notes: input.notes,
    time: input.time,
    duration_min: input.duration_min,
    area_id: input.area_id,
    attention: input.attention,
    remind: input.remind ?? false,
    start_date: startDate,
  };
}

function insert(table: Table, row: Row & { id: string }): Op {
  return { kind: "insert", table, row };
}

function recurrenceInsert(id: string, input: TaskInput, repeat: Exclude<RepeatInput, { kind: "none" }>, startDate: LocalDate): Op {
  return insert("recurrences", {
    id,
    kind: repeat.kind,
    rrule: repeat.kind === "fixed" ? repeat.rrule : null,
    interval_days: repeat.kind === "after_completion" ? repeat.intervalDays : null,
    until: repeat.until ?? null,
    template: templateFrom(input, startDate),
  });
}

/**
 * Crea un'attività e ne restituisce l'id; con una ripetizione crea anche la ricorrenza di cui è la prima occorrenza.
 * Le occorrenze successive di una ripetizione fissa nascono alla prossima sincronizzazione (`materializeRecurrences`).
 */
export async function createTask(input: TaskInput, repeat: RepeatInput, today: LocalDate): Promise<string> {
  const row: Partial<Task> & { id: string } = { id: uuidv7(), ...input };
  const ops: Op[] = [];
  if (repeat.kind !== "none") {
    row.date = input.date ?? today;
    row.recurrence_id = uuidv7();
    row.source = "recurrence";
    ops.push(recurrenceInsert(row.recurrence_id, input, repeat, row.date));
  }
  await commit([...ops, insert("tasks", row)]);
  return row.id;
}

/** Modifica un'attività. Passare l'attività intera permette di mostrarla subito anche nelle viste che non l'avevano. */
function taskUpdate(task: Pick<Task, "id"> | Task, patch: Partial<Task>): Op {
  const snapshot = "title" in task ? { ...task, ...patch } : undefined;
  return { kind: "update", table: "tasks", patch, where: byId(task.id), snapshot };
}

export async function updateTask(task: Pick<Task, "id"> | Task, patch: Partial<Task>): Promise<void> {
  await commit([taskUpdate(task, patch)]);
}

/** Salva le modifiche a un'attività e, se richiesta, le aggiunge una ripetizione. */
export async function saveTask(task: Task, input: TaskInput, repeat: RepeatInput, today: LocalDate): Promise<void> {
  if (task.recurrence_id || repeat.kind === "none") return updateTask(task, input);
  const date = input.date ?? today;
  const recurrenceId = uuidv7();
  await commit([
    recurrenceInsert(recurrenceId, input, repeat, date),
    taskUpdate(task, { ...input, recurrence_id: recurrenceId, date }),
  ]);
}

/** Ferma una ricorrenza ed elimina le occorrenze future non ancora completate. */
export async function stopRecurrence(recurrenceId: string, today: LocalDate): Promise<void> {
  await commit([
    { kind: "update", table: "recurrences", patch: { active: false }, where: byId(recurrenceId) },
    {
      kind: "update",
      table: "tasks",
      patch: { deleted_at: new Date().toISOString() },
      where: [
        ["recurrence_id", "eq", recurrenceId],
        ["status", "eq", "open"],
        ["date", "gt", today],
      ],
    },
  ]);
}

function taskFromTemplate(recurrenceId: string, template: RecurrenceTemplate, id: string, date: LocalDate) {
  return {
    id,
    title: template.title,
    notes: template.notes,
    date,
    time: template.time,
    duration_min: template.duration_min,
    area_id: template.area_id,
    attention: template.attention,
    remind: template.remind ?? false,
    recurrence_id: recurrenceId,
    source: "recurrence" as const,
  };
}

/**
 * Crea le attività dei prossimi 14 giorni per le ricorrenze a calendario fisso.
 * Gli id sono deterministici: ripetere l'operazione, anche da un altro dispositivo, non duplica nulla
 * e un'occorrenza eliminata non viene ricreata. Serve la rete: senza, si rifà alla prossima sincronizzazione.
 */
export async function materializeRecurrences(today: LocalDate): Promise<number> {
  const supabase = getSupabase();
  const recurrences: Recurrence[] = check(
    await supabase.from("recurrences").select("*").eq("kind", "fixed").eq("active", true),
  );
  const rows = [];
  for (const r of recurrences) {
    for (const date of datesToMaterialize(r, today)) {
      rows.push(taskFromTemplate(r.id, r.template, await deterministicId(`${r.id}:${date}`), date));
    }
  }
  if (!rows.length) return 0;
  const created: { id: string }[] = check(
    await supabase.from("tasks").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id"),
  );
  return created.length;
}

function nextInstanceId(task: Pick<Task, "id" | "recurrence_id">) {
  return deterministicId(`${task.recurrence_id}:after:${task.id}`);
}

/** Completa un'attività; se appartiene a una ricorrenza "N giorni dopo" crea anche la prossima. */
export async function completeTask(task: Task, completedAt: Date, tz: string): Promise<void> {
  const ops = [taskUpdate(task, completePatch(completedAt)), ...reminderToggledOps(task, true, completedAt.toISOString())];
  const recurrence = task.recurrence_id ? await findRecurrence(task.recurrence_id) : null;
  const date = recurrence ? nextAfterCompletion(recurrence, localDateString(completedAt, tz)) : null;
  if (recurrence && date) {
    ops.push(insert("tasks", taskFromTemplate(recurrence.id, recurrence.template, await nextInstanceId(task), date)));
  }
  await commit(ops);
}

/** Elimina un'attività (reversibile). Se era la preparazione di un pasto, il pasto resta da preparare senza promemoria. */
export async function removeTask(task: Task): Promise<void> {
  await commit([taskUpdate(task, { deleted_at: new Date().toISOString() }), ...reminderRemovedOps(task)]);
}

/** Annulla un'eliminazione appena fatta. */
export async function restoreTask(task: Task): Promise<void> {
  await commit([taskUpdate(task, { deleted_at: null }), ...reminderRestoredOps(task)]);
}

/** Rimette da fare un'attività; l'attività successiva della ricorrenza si toglie, se è ancora intatta. */
export async function reopenTask(task: Task): Promise<void> {
  const ops = [taskUpdate(task, reopenPatch()), ...reminderToggledOps(task, false, new Date().toISOString())];
  if (task.recurrence_id) {
    ops.push({
      kind: "delete",
      table: "tasks",
      where: [
        ["id", "eq", await nextInstanceId(task)],
        ["status", "eq", "open"],
      ],
    });
  }
  await commit(ops);
}

export type EventInput = Pick<
  EventRow,
  "title" | "notes" | "location" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "rrule" | "area_id" | "attention"
> & { kind?: EventRow["kind"] };

export async function createEvent(input: EventInput): Promise<string> {
  const id = uuidv7();
  await commit([insert("events", { id, ...input })]);
  return id;
}

export async function updateEvent(event: EventRow, patch: Partial<EventRow>): Promise<void> {
  await commit([{ kind: "update", table: "events", patch, where: byId(event.id), snapshot: { ...event, ...patch } }]);
}

/** Cancella una sola occorrenza di un evento ricorrente. */
export async function cancelOccurrence(eventId: string, originalStart: Date): Promise<void> {
  await commit([
    {
      kind: "insert",
      table: "event_exceptions",
      row: { id: uuidv7(), event_id: eventId, original_start: originalStart.toISOString(), cancelled: true },
      onConflict: "event_id,original_start",
      merge: true,
    },
  ]);
}

export async function fetchLogCategories(): Promise<LogCategory[]> {
  return check(
    await getSupabase()
      .from("log_categories")
      .select("id, name, color, is_sensitive, track_last, keywords, sort_order")
      .order("sort_order"),
  );
}

export async function fetchLists(): Promise<List[]> {
  return check(await getSupabase().from("lists").select("id, kind, name").order("created_at"));
}

/** L'id della lista, dalla cache: si trova anche senza rete. */
export async function listId(kind: List["kind"]): Promise<string> {
  const list = (await queryClient.ensureQueryData(listsQuery)).find((l) => l.kind === kind);
  if (!list) throw new Error(`Lista mancante: ${kind}`);
  return list.id;
}

/** Con un link l'articolo nasce con `source = 'link'`: i metadati si recuperano dopo (incremento 8). */
export async function createWishlistItem(name: string, url: string | null): Promise<string> {
  const id = uuidv7();
  await commit([insert("wishlist_items", { id, list_id: await listId("wishlist"), name, url, source: url ? "link" : "manual" })]);
  return id;
}

/** Eliminazione reversibile (soft delete), usata dall'annullamento. */
export async function softDelete(
  table: "tasks" | "events" | "shopping_items" | "wishlist_items" | "log_entries" | "workouts",
  id: string,
): Promise<void> {
  await commit([{ kind: "update", table, patch: { deleted_at: new Date().toISOString() }, where: byId(id) }]);
}

export type ImportResult = { created: number; existing: number };

const IMPORT_CHUNK = 200;

async function insertNew(table: "events" | "tasks" | "event_exceptions", rows: object[], onConflict = "id"): Promise<string[]> {
  const created: string[] = [];
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const result: { id: string }[] = check(
      await getSupabase()
        .from(table)
        .upsert(rows.slice(i, i + IMPORT_CHUNK), { onConflict, ignoreDuplicates: true })
        .select("id"),
    );
    created.push(...result.map((r) => r.id));
  }
  return created;
}

/**
 * Salva gli elementi scelti nell'anteprima di un file .ics.
 * L'id deriva dall'UID del file: importare di nuovo lo stesso file non duplica nulla
 * e un elemento eliminato nell'app non viene ricreato.
 */
export async function importItems(items: ImportItem[], tz: string): Promise<ImportResult> {
  const events = [];
  const tasks = [];
  const exceptionsByEvent = new Map<string, ReturnType<typeof toExceptionInputs>>();
  for (const item of items) {
    if (item.kind === "task") {
      tasks.push({ id: await deterministicId(`ics-task:${item.uid}`), ...toTaskInput(item, tz) });
    } else {
      const id = await deterministicId(`ics:${item.uid}`);
      events.push({ id, ...toEventInput(item) });
      exceptionsByEvent.set(id, toExceptionInputs(item));
    }
  }
  const createdEvents = await insertNew("events", events);
  const exceptions = createdEvents.flatMap((eventId) =>
    (exceptionsByEvent.get(eventId) ?? []).map((ex) => ({ id: uuidv7(), event_id: eventId, ...ex })),
  );
  await insertNew("event_exceptions", exceptions, "event_id,original_start");
  const createdTasks = await insertNew("tasks", tasks);
  const created = createdEvents.length + createdTasks.length;
  return { created, existing: items.length - created };
}
