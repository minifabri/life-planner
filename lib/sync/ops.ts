import { addDays, startOfLocalDay, type LocalDate } from "../dates/local";
import type { EventException, EventRow, MealMemory, MealPlan, Recurrence, ShoppingItem, Task } from "../supabase/types";

/**
 * Una modifica ai dati, descritta in modo che si possa sia inviare a Supabase
 * sia applicare ai dati in cache mentre aspetta nella outbox (technical-design.md, 6.1).
 */
export type Table =
  | "tasks"
  | "events"
  | "event_exceptions"
  | "recurrences"
  | "meal_plans"
  | "meal_memory"
  | "shopping_items"
  | "wishlist_items"
  | "log_entries";

export type Row = Record<string, unknown>;
export type Filter = [column: string, op: "eq" | "gt", value: string | number | boolean];

export type Op =
  /**
   * Inserimento. Rifarlo non duplica: una riga che esiste già (stessa chiave `onConflict`, di norma l'id)
   * resta com'è, oppure viene aggiornata se `merge` è vero.
   */
  | { kind: "insert"; table: Table; row: Row & { id: string }; onConflict?: string; merge?: boolean }
  /** Aggiornamento delle righe che rispettano i filtri. `snapshot` è la riga intera dopo la modifica, se nota. */
  | { kind: "update"; table: Table; patch: Row; where: Filter[]; snapshot?: Row & { id: string } }
  | { kind: "delete"; table: Table; where: Filter[] };

export function byId(id: string): Filter[] {
  return [["id", "eq", id]];
}

function matches(row: Row, where: Filter[]): boolean {
  return where.every(([column, op, value]) => {
    const actual = row[column];
    if (op === "eq") return actual === value;
    return actual !== null && actual !== undefined && (actual as string | number) > (value as string | number);
  });
}

function sameKey(a: Row, b: Row, onConflict = "id"): boolean {
  return onConflict.split(",").every((column) => a[column] === b[column]);
}

/**
 * Applica una modifica a un elenco di righe già in cache.
 * `complete` aggiunge a una riga nuova i valori che di solito mette il database;
 * `accepts` dice se una riga nuova appartiene a questo elenco.
 */
function applyToRows<T extends { id: string }>(
  rows: T[],
  op: Op,
  complete: (row: Row & { id: string }) => T,
  accepts: (row: T) => boolean = () => true,
): T[] {
  if (op.kind === "delete") return rows.filter((r) => !matches(r, op.where));
  if (op.kind === "insert") {
    const existing = rows.findIndex((r) => sameKey(r, op.row, op.onConflict));
    if (existing === -1) {
      const row = complete(op.row);
      return accepts(row) ? [...rows, row] : rows;
    }
    if (!op.merge) return rows;
    return rows.map((r, i) => (i === existing ? { ...r, ...op.row, id: r.id } : r));
  }
  let found = false;
  const next = rows.map((r) => {
    if (!matches(r, op.where)) return r;
    found = true;
    return { ...r, ...op.patch };
  });
  if (!found && op.snapshot) {
    const row = complete(op.snapshot);
    if (accepts(row)) next.push(row);
  }
  return next;
}

function completeTask(at: string) {
  return (row: Row & { id: string }): Task => ({
    notes: null,
    date: null,
    time: null,
    duration_min: null,
    due_date: null,
    window_start: null,
    attention: "low",
    area_id: null,
    status: "open",
    completed_at: null,
    original_date: null,
    recurrence_id: null,
    source: "manual",
    meal_plan_id: null,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    ...(row as Partial<Task> & { id: string; title: string }),
  });
}

function completeEvent(at: string) {
  return (row: Row & { id: string }): EventRow => ({
    notes: null,
    location: null,
    start_at: null,
    end_at: null,
    all_day: false,
    start_date: null,
    end_date: null,
    tz: "Europe/Rome",
    rrule: null,
    area_id: null,
    attention: "low",
    source: "app",
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    ...(row as Partial<EventRow> & { id: string; title: string }),
  });
}

/** Le attività di una vista del giorno dopo una modifica in attesa (`at` è il momento della modifica). */
export function applyToTasks(tasks: Task[], op: Op, at: string): Task[] {
  if (op.table !== "tasks") return tasks;
  return applyToRows(tasks, op, completeTask(at)).filter((t) => !t.deleted_at);
}

/** Stesso criterio della query `fetchEvents`: l'evento può toccare il giorno. */
export function eventTouchesDay(event: EventRow, day: LocalDate, tz: string): boolean {
  if (event.rrule) return true;
  if (event.start_at) {
    const from = startOfLocalDay(addDays(day, -7), tz).toISOString();
    const to = startOfLocalDay(addDays(day, 1), tz).toISOString();
    const start = new Date(event.start_at).toISOString();
    if (start >= from && start < to) return true;
  }
  return event.all_day && !!event.start_date && event.start_date <= day && event.start_date >= addDays(day, -60);
}

export type DayEvents = { events: EventRow[]; exceptions: EventException[] };

/** Gli eventi di una vista del giorno dopo una modifica in attesa. */
export function applyToDayEvents(data: DayEvents, op: Op, at: string, day: LocalDate, tz: string): DayEvents {
  if (op.table === "events") {
    const events = applyToRows(data.events, op, completeEvent(at), (e) => eventTouchesDay(e, day, tz)).filter(
      (e) => !e.deleted_at && eventTouchesDay(e, day, tz),
    );
    return { events, exceptions: data.exceptions };
  }
  if (op.table === "event_exceptions") {
    const exceptions = applyToRows(
      data.exceptions,
      op,
      (row) => ({ cancelled: false, new_start_at: null, new_end_at: null, ...(row as Partial<EventException> & { id: string }) }) as EventException,
      (ex) => data.events.some((e) => e.id === ex.event_id),
    );
    return { events: data.events, exceptions };
  }
  return data;
}

export function applyToRecurrences(recurrences: Recurrence[], op: Op): Recurrence[] {
  if (op.table !== "recurrences") return recurrences;
  return applyToRows(recurrences, op, (row) => ({ active: true, until: null, rrule: null, interval_days: null, ...row }) as Recurrence);
}

/** La lista della spesa dopo una modifica in attesa. */
export function applyToShopping(items: ShoppingItem[], op: Op, at: string): ShoppingItem[] {
  if (op.table !== "shopping_items") return items;
  return applyToRows(
    items,
    op,
    (row) =>
      ({ quantity: null, department: null, checked: false, checked_at: null, deleted_at: null, created_at: at, ...row }) as ShoppingItem,
  ).filter((i) => !i.deleted_at);
}

/** I pasti di una settimana (da `from` a `to`, inclusi) dopo una modifica in attesa. */
export function applyToMeals(meals: MealPlan[], op: Op, from: LocalDate, to: LocalDate): MealPlan[] {
  if (op.table !== "meal_plans") return meals;
  return applyToRows(
    meals,
    op,
    (row) => ({ prepared: false, prepared_at: null, reminder_task_id: null, ...row }) as MealPlan,
    (m) => m.date >= from && m.date <= to,
  );
}

export function applyToMealMemory(memory: MealMemory[], op: Op): MealMemory[] {
  if (op.table !== "meal_memory") return memory;
  return applyToRows(memory, op, (row) => row as MealMemory);
}

/** Esito di un invio, dal codice HTTP della risposta (0 = la richiesta non è partita o non è arrivata). */
export type SendOutcome = "done" | "retry" | "rejected";

/**
 * Senza rete, con il server in difficoltà o con la sessione da rinnovare si riprova più tardi.
 * Un rifiuto vero (dato non valido, permesso negato) non cambierà riprovando: la modifica si scarta.
 */
export function classifyStatus(status: number, hasError: boolean): SendOutcome {
  if (!hasError && status >= 200 && status < 300) return "done";
  if (status === 0 || status >= 500 || status === 401 || status === 408 || status === 429) return "retry";
  return "rejected";
}
