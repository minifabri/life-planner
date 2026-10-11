import type { LocalDate } from "../dates/local";
import { deterministicId } from "../ids";
import { addPrepOps, prepTaskKey, removePrepOps } from "../imayoga/prep";
import { getSupabase } from "../supabase/client";
import type { EventRow, Task } from "../supabase/types";
import { commit, withPendingTasks } from "../sync/engine";
import { queryClient } from "./query-client";

function prepTaskId(eventId: string): Promise<string> {
  return deterministicId(prepTaskKey(eventId));
}

/** L'attività di preparazione di una lezione, se c'è (anche completata), con le modifiche non ancora inviate. */
export async function fetchLessonPrep(eventId: string): Promise<Task | null> {
  const id = await prepTaskId(eventId);
  const { data, error } = await getSupabase().from("tasks").select("*").eq("id", id).is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (await withPendingTasks((data ?? []) as Task[])).find((t) => t.id === id) ?? null;
}

export const lessonPrepQuery = (eventId: string) => ({
  queryKey: ["lesson-prep", eventId],
  queryFn: () => fetchLessonPrep(eventId),
});

/** Segna la lezione come da preparare (crea l'attività) oppure toglie l'attività. */
export async function setLessonToPrep(event: EventRow, toPrep: boolean, today: LocalDate): Promise<void> {
  const id = await prepTaskId(event.id);
  await commit(toPrep ? addPrepOps(event, id, today) : removePrepOps(id, new Date().toISOString()));
  await queryClient.invalidateQueries({ queryKey: ["lesson-prep", event.id] });
}
