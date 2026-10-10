import { addDays, startOfLocalDay, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import { deterministicId, uuidv7 } from "../ids";
import { toEventInput, toExceptionInputs, toTaskInput, type ImportItem } from "../import/ics";
import { datesToMaterialize, nextAfterCompletion } from "../recurrence/expand";
import { getSupabase } from "../supabase/client";
import type { Area, EventException, EventRow, Profile, Recurrence, RecurrenceTemplate, Task } from "../supabase/types";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function fetchProfile(): Promise<Profile | null> {
  return check(await getSupabase().from("profiles").select("owner_id, display_name, timezone, theme").maybeSingle());
}

export async function fetchAreas(): Promise<Area[]> {
  return check(await getSupabase().from("areas").select("*").is("archived_at", null).order("sort_order"));
}

/**
 * Attività utili alla vista del giorno: tutte quelle aperte (per rimaste indietro e nel periodo),
 * quelle del giorno in qualsiasi stato e quelle completate dal giorno in poi.
 */
export async function fetchTasks(day: LocalDate, tz: string): Promise<Task[]> {
  const dayStart = startOfLocalDay(day, tz).toISOString();
  return check(
    await getSupabase()
      .from("tasks")
      .select("*")
      .is("deleted_at", null)
      .or(`status.eq.open,date.eq.${day},completed_at.gte."${dayStart}"`),
  );
}

export type DayEvents = { events: EventRow[]; exceptions: EventException[] };

/** Eventi che possono toccare il giorno: quelli vicini, quelli di tutto il giorno recenti e tutte le serie. */
export async function fetchEvents(day: LocalDate, tz: string): Promise<DayEvents> {
  const supabase = getSupabase();
  const from = startOfLocalDay(addDays(day, -7), tz).toISOString();
  const to = startOfLocalDay(addDays(day, 1), tz).toISOString();
  const events: EventRow[] = check(
    await supabase
      .from("events")
      .select("*")
      .is("deleted_at", null)
      .or(
        `rrule.not.is.null,and(start_at.gte."${from}",start_at.lt."${to}"),and(all_day.is.true,start_date.lte.${day},start_date.gte.${addDays(day, -60)})`,
      ),
  );
  const recurring = events.filter((e) => e.rrule).map((e) => e.id);
  const exceptions: EventException[] = recurring.length
    ? check(await supabase.from("event_exceptions").select("*").in("event_id", recurring))
    : [];
  return { events, exceptions };
}

export async function fetchRecurrence(id: string): Promise<Recurrence | null> {
  return check(await getSupabase().from("recurrences").select("*").eq("id", id).maybeSingle());
}

export type TaskInput = Pick<
  Task,
  "title" | "notes" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "attention" | "area_id"
>;

export type RepeatInput =
  | { kind: "none" }
  | { kind: "fixed"; rrule: string }
  | { kind: "after_completion"; intervalDays: number };

function templateFrom(input: TaskInput, startDate: LocalDate): RecurrenceTemplate {
  return {
    title: input.title,
    notes: input.notes,
    time: input.time,
    duration_min: input.duration_min,
    area_id: input.area_id,
    attention: input.attention,
    start_date: startDate,
  };
}

async function createRecurrence(input: TaskInput, repeat: Exclude<RepeatInput, { kind: "none" }>, startDate: LocalDate) {
  const id = uuidv7();
  check(
    await getSupabase()
      .from("recurrences")
      .insert({
        id,
        kind: repeat.kind,
        rrule: repeat.kind === "fixed" ? repeat.rrule : null,
        interval_days: repeat.kind === "after_completion" ? repeat.intervalDays : null,
        template: templateFrom(input, startDate),
      })
      .select("id"),
  );
  return id;
}

/** Crea un'attività; con una ripetizione crea anche la ricorrenza di cui è la prima occorrenza. */
export async function createTask(input: TaskInput, repeat: RepeatInput, today: LocalDate): Promise<void> {
  const row: Partial<Task> = { id: uuidv7(), ...input };
  if (repeat.kind !== "none") {
    row.date = input.date ?? today;
    row.recurrence_id = await createRecurrence(input, repeat, row.date);
    row.source = "recurrence";
  }
  check(await getSupabase().from("tasks").insert(row).select("id"));
  if (repeat.kind === "fixed") await materializeRecurrences(today);
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  check(await getSupabase().from("tasks").update(patch).eq("id", id).select("id"));
}

/** Aggiunge una ripetizione a un'attività esistente. */
export async function addRepeat(task: Task, input: TaskInput, repeat: RepeatInput, today: LocalDate): Promise<void> {
  if (repeat.kind === "none") return;
  const date = input.date ?? today;
  const recurrenceId = await createRecurrence(input, repeat, date);
  await updateTask(task.id, { recurrence_id: recurrenceId, date });
  if (repeat.kind === "fixed") await materializeRecurrences(today);
}

/** Ferma una ricorrenza ed elimina le occorrenze future non ancora completate. */
export async function stopRecurrence(recurrenceId: string, today: LocalDate): Promise<void> {
  const supabase = getSupabase();
  check(await supabase.from("recurrences").update({ active: false }).eq("id", recurrenceId).select("id"));
  check(
    await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("recurrence_id", recurrenceId)
      .eq("status", "open")
      .gt("date", today)
      .select("id"),
  );
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
    recurrence_id: recurrenceId,
    source: "recurrence" as const,
  };
}

/**
 * Crea le attività dei prossimi 14 giorni per le ricorrenze a calendario fisso.
 * Gli id sono deterministici: ripetere l'operazione, anche da un altro dispositivo, non duplica nulla
 * e un'occorrenza eliminata non viene ricreata.
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

/** Dopo il completamento: crea la prossima attività di una ricorrenza "N giorni dopo". */
export async function createNextAfterCompletion(task: Task, completedAt: Date, tz: string): Promise<void> {
  if (!task.recurrence_id) return;
  const recurrence = await fetchRecurrence(task.recurrence_id);
  if (!recurrence) return;
  const date = nextAfterCompletion(recurrence, localDateString(completedAt, tz));
  if (!date) return;
  const row = taskFromTemplate(recurrence.id, recurrence.template, await nextInstanceId(task), date);
  check(await getSupabase().from("tasks").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("id"));
}

/** Annullando il completamento si toglie l'attività successiva, se è ancora intatta. */
export async function removeNextAfterCompletion(task: Task): Promise<void> {
  if (!task.recurrence_id) return;
  check(
    await getSupabase().from("tasks").delete().eq("id", await nextInstanceId(task)).eq("status", "open").select("id"),
  );
}

export type EventInput = Pick<
  EventRow,
  "title" | "notes" | "location" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "rrule" | "area_id" | "attention"
>;

export async function createEvent(input: EventInput): Promise<void> {
  check(await getSupabase().from("events").insert({ id: uuidv7(), ...input }).select("id"));
}

export async function updateEvent(id: string, patch: Partial<EventRow>): Promise<void> {
  check(await getSupabase().from("events").update(patch).eq("id", id).select("id"));
}

/** Cancella una sola occorrenza di un evento ricorrente. */
export async function cancelOccurrence(eventId: string, originalStart: Date): Promise<void> {
  check(
    await getSupabase()
      .from("event_exceptions")
      .upsert(
        { id: uuidv7(), event_id: eventId, original_start: originalStart.toISOString(), cancelled: true },
        { onConflict: "event_id,original_start" },
      )
      .select("id"),
  );
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
