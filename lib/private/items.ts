import type { EventRow, Task } from "../supabase/types";

/**
 * Attività ed eventi riservati (D68). A Log bloccato del server si chiedono solo le colonne che dicono
 * quando e quanto: il resto non arriva al dispositivo e al posto del titolo si mostra un titolo neutro.
 * A Log sbloccato si chiedono le righe intere, che restano solo in memoria.
 */

export const PRIVATE_TASK_TITLE = "Attività riservata";
export const PRIVATE_EVENT_TITLE = "Evento riservato";

/** Colonne di un'attività riservata a Log bloccato: giorno, ora, durata e stato, nient'altro. */
export const TASK_STUB_COLUMNS = "id, date, time, duration_min, due_date, window_start, status, completed_at, original_date, created_at, updated_at";

/** Colonne di un evento riservato a Log bloccato: inizio, fine e ripetizione. */
export const EVENT_STUB_COLUMNS = "id, start_at, end_at, all_day, start_date, end_date, tz, rrule, created_at, updated_at";

export type TaskStub = Pick<
  Task,
  "id" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "status" | "completed_at" | "original_date" | "created_at" | "updated_at"
>;

export type EventStub = Pick<EventRow, "id" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "rrule" | "created_at" | "updated_at">;

/** L'attività da mostrare a Log bloccato: titolo neutro, attenzione bassa, nessuna area né nota. */
export function taskFromStub(stub: TaskStub): Task {
  return {
    ...stub,
    title: PRIVATE_TASK_TITLE,
    notes: null,
    attention: "low",
    remind: false,
    area_id: null,
    recurrence_id: null,
    source: "manual",
    meal_plan_id: null,
    event_id: null,
    shopping_item_id: null,
    is_private: true,
    deleted_at: null,
  };
}

/** L'evento da mostrare a Log bloccato: titolo neutro, senza luogo, area né nota. */
export function eventFromStub(stub: EventStub): EventRow {
  return {
    ...stub,
    title: PRIVATE_EVENT_TITLE,
    notes: null,
    location: null,
    area_id: null,
    attention: "low",
    source: "app",
    kind: "event",
    gcal_calendar_id: null,
    gcal_event_id: null,
    gcal_etag: null,
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    lesson: null,
    is_private: true,
    deleted_at: null,
  };
}

/** Vero se l'elemento è riservato e quello che si ha è solo il segnaposto (Log bloccato). */
export function isStub(item: { is_private?: boolean; title: string }, unlocked: boolean): boolean {
  return !!item.is_private && !unlocked;
}

/**
 * La riga da usare fuori dall'app (notifiche): di un elemento riservato mai titolo, note o luogo.
 * Funziona su qualunque riga con `title` e `is_private`.
 */
export function neutralized<T extends { title: string; notes?: string | null; location?: string | null; is_private?: boolean }>(item: T, title: string): T {
  if (!item.is_private) return item;
  return { ...item, title, ...("notes" in item ? { notes: null } : {}), ...("location" in item ? { location: null } : {}) };
}

/** Unisce elementi pubblici e riservati senza doppioni: se lo stesso id è in tutti e due, vince il riservato (è il più recente). */
export function mergeById<T extends { id: string }>(open: T[], reserved: T[]): T[] {
  if (!reserved.length) return open;
  const ids = new Set(reserved.map((r) => r.id));
  return [...open.filter((o) => !ids.has(o.id)), ...reserved];
}
