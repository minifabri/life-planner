import { localTimeString, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import type { EventRow, Task, Workout } from "../supabase/types";

/** I campi che si scrivono a mano; il resto lo decide lo stato. */
export type WorkoutInput = Pick<
  Workout,
  "activity" | "date" | "time" | "duration_min" | "notes" | "status" | "completed_at" | "distance_m" | "energy_kcal" | "avg_hr"
>;

/** Un'attività ricorrente o nata da un pasto resta un'attività: trasformarla romperebbe ciò che la genera. */
export function canConvertTask(task: Pick<Task, "recurrence_id" | "source">): boolean {
  return !task.recurrence_id && task.source !== "meal";
}

/** Si trasforma solo un evento nato nell'app, con un giorno solo e senza ripetizione. */
export function canConvertEvent(event: Pick<EventRow, "source" | "rrule">): boolean {
  return event.source === "app" && !event.rrule;
}

/** Un'attività come allenamento: senza giorno prende la scadenza, o oggi. */
export function workoutFromTask(task: Task, today: LocalDate): WorkoutInput {
  const done = task.status === "done";
  return {
    activity: task.title,
    date: task.date ?? task.due_date ?? today,
    time: task.date ? task.time : null,
    duration_min: task.duration_min,
    notes: task.notes,
    status: done ? "done" : task.status === "dismissed" ? "skipped" : "planned",
    completed_at: done ? task.completed_at : null,
    distance_m: null,
    energy_kcal: null,
    avg_hr: null,
  };
}

/** Un evento come allenamento: l'orario diventa ora e durata; se è già passato vale come fatto. */
export function workoutFromEvent(event: EventRow, today: LocalDate, now: Date): WorkoutInput {
  const start = event.start_at ? new Date(event.start_at) : null;
  const end = event.end_at ? new Date(event.end_at) : null;
  const date = start ? localDateString(start, event.tz) : (event.start_date ?? today);
  const finished = (end ?? start)?.getTime();
  const done = finished !== undefined ? finished <= now.getTime() : date < today;
  return {
    activity: event.title,
    date,
    time: start ? localTimeString(start, event.tz) : null,
    duration_min: start && end && end > start ? Math.round((end.getTime() - start.getTime()) / 60_000) : null,
    notes: [event.notes, event.location].filter(Boolean).join("\n") || null,
    status: done ? "done" : "planned",
    completed_at: done ? (end ?? start ?? now).toISOString() : null,
    distance_m: null,
    energy_kcal: null,
    avg_hr: null,
  };
}
