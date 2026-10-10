import { type LocalDate } from "../dates/local";
import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { EventRow, Task, Workout } from "../supabase/types";
import { commit, withPendingWorkouts } from "../sync/engine";
import { byId, type Op } from "../sync/ops";
import { workoutFromEvent, workoutFromTask, type WorkoutInput } from "../workouts/convert";

/** Gli allenamenti dei giorni da `from` a `to`, inclusi. */
export async function fetchWorkouts(from: LocalDate, to: LocalDate): Promise<Workout[]> {
  const { data, error } = await getSupabase()
    .from("workouts")
    .select("*")
    .is("deleted_at", null)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw new Error(error.message);
  return withPendingWorkouts(data as Workout[], from, to);
}

function workoutInsert(id: string, input: WorkoutInput): Op {
  return { kind: "insert", table: "workouts", row: { id, ...input } };
}

export async function createWorkout(input: WorkoutInput): Promise<string> {
  const id = uuidv7();
  await commit([workoutInsert(id, input)]);
  return id;
}

/** Passare l'allenamento intero permette di mostrarlo subito anche nelle viste che non lo avevano (es. spostato in un'altra settimana). */
export async function updateWorkout(workout: Workout, patch: Partial<Workout>): Promise<void> {
  await commit([{ kind: "update", table: "workouts", patch, where: byId(workout.id), snapshot: { ...workout, ...patch } }]);
}

/** Eliminazione reversibile. */
export async function removeWorkout(workout: Workout): Promise<void> {
  await updateWorkout(workout, { deleted_at: new Date().toISOString() });
}

/** Trasforma un'attività in un allenamento: l'attività si elimina (reversibile) nello stesso passo. */
export async function convertTaskToWorkout(task: Task, today: LocalDate): Promise<string> {
  const id = uuidv7();
  await commit([
    workoutInsert(id, workoutFromTask(task, today)),
    { kind: "update", table: "tasks", patch: { deleted_at: new Date().toISOString() }, where: byId(task.id) },
  ]);
  return id;
}

export async function convertEventToWorkout(event: EventRow, today: LocalDate): Promise<string> {
  const id = uuidv7();
  await commit([
    workoutInsert(id, workoutFromEvent(event, today, new Date())),
    { kind: "update", table: "events", patch: { deleted_at: new Date().toISOString() }, where: byId(event.id) },
  ]);
  return id;
}
