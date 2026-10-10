import { addDays, nextWeekday, type LocalDate } from "../dates/local";
import type { Task } from "../supabase/types";

export type TaskPatch = Partial<Omit<Task, "id" | "created_at" | "updated_at">>;

export function completePatch(now: Date): TaskPatch {
  return { status: "done", completed_at: now.toISOString() };
}

export function reopenPatch(): TaskPatch {
  return { status: "open", completed_at: null };
}

export function dismissPatch(): TaskPatch {
  return { status: "dismissed" };
}

/**
 * Sposta un'attività a un altro giorno. La prima volta ricorda il giorno di partenza
 * in `original_date`, così si sa da quando è rimasta indietro.
 */
export function movePatch(task: Pick<Task, "date" | "due_date" | "original_date">, date: LocalDate): TaskPatch {
  const from = task.date ?? task.due_date;
  const patch: TaskPatch = { date };
  if (!task.original_date && from && from !== date) patch.original_date = from;
  return patch;
}

/** Date rapide della modale Riprogramma (D30): domani, lunedì, fra una settimana. */
export function quickDates(today: LocalDate): { label: string; date: LocalDate }[] {
  const options = [
    { label: "Domani", date: addDays(today, 1) },
    { label: "Lunedì", date: nextWeekday(today, 1) },
    { label: "Fra una settimana", date: addDays(today, 7) },
  ];
  return options.filter((o, i) => options.findIndex((p) => p.date === o.date) === i);
}
