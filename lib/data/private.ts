import type { LocalDate } from "../dates/local";
import { EVENT_STUB_COLUMNS, TASK_STUB_COLUMNS, eventFromStub, taskFromStub, type EventStub, type TaskStub } from "../private/items";
import { getSupabase } from "../supabase/client";
import type { EventRow, Task } from "../supabase/types";
import { PRIVATE_ITEMS_KEY } from "../sync/engine";
import type { DayEvents } from "../sync/ops";
import { eventsFilter, fetchExceptions, tasksFilter } from "./api";
import { queryClient } from "./query-client";

/**
 * Attività ed eventi riservati (D68), come le registrazioni riservate del Log:
 * a Log bloccato dal server arrivano solo giorno, orario e stato; a Log sbloccato le righe intere.
 * Le query hanno la chiave "private-items", che non è tra quelle salvate sul dispositivo (`PERSISTED_QUERIES`),
 * e le scritture non passano dalla outbox (`commitDirect`).
 */
export { PRIVATE_ITEMS_KEY };

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function fetchPrivateTasks(day: LocalDate, tz: string, to: LocalDate, full: boolean): Promise<Task[]> {
  const rows = check(await tasksFilter(getSupabase().from("tasks").select(full ? "*" : TASK_STUB_COLUMNS), day, tz, to).eq("is_private", true));
  return full ? (rows as unknown as Task[]) : (rows as unknown as TaskStub[]).map(taskFromStub);
}

export async function fetchPrivateEvents(day: LocalDate, tz: string, to: LocalDate, full: boolean): Promise<DayEvents> {
  const rows = check(await eventsFilter(getSupabase().from("events").select(full ? "*" : EVENT_STUB_COLUMNS), day, tz, to).eq("is_private", true));
  const events = full ? (rows as unknown as EventRow[]) : (rows as unknown as EventStub[]).map(eventFromStub);
  return { events, exceptions: await fetchExceptions(events) };
}

/** Un'attività riservata intera, per aprirla a Log sbloccato. */
export async function fetchPrivateTask(id: string): Promise<Task | null> {
  return check(await getSupabase().from("tasks").select("*").eq("id", id).is("deleted_at", null).maybeSingle()) as Task | null;
}

/** Un evento riservato intero, per aprirlo a Log sbloccato. */
export async function fetchPrivateEvent(id: string): Promise<EventRow | null> {
  return check(await getSupabase().from("events").select("*").eq("id", id).is("deleted_at", null).maybeSingle()) as EventRow | null;
}

/** Al blocco del Log il contenuto riservato esce dalla memoria; restano (e si rileggono) solo i segnaposto. */
export function forgetPrivateItems() {
  queryClient.removeQueries({ queryKey: [PRIVATE_ITEMS_KEY], predicate: (q) => q.queryKey.includes("full") });
}

export function refreshPrivateItems() {
  return queryClient.invalidateQueries({ queryKey: [PRIVATE_ITEMS_KEY] });
}
