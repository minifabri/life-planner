"use client";

import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { addDays, endOfWeek, weekStart, type LocalDate } from "../dates/local";
import type { Workout } from "../supabase/types";
import { completeWorkoutPatch, reopenWorkoutPatch, skipWorkoutPatch } from "../workouts/summary";
import { fetchWorkouts, removeWorkout, updateWorkout } from "./workouts";

/** Quante settimane passate tiene lo storico. */
export const HISTORY_WEEKS = 12;

export function workoutsQuery(from: LocalDate, to: LocalDate) {
  return { queryKey: ["workouts", from, to], queryFn: () => fetchWorkouts(from, to) };
}

/** Allenamenti di un intervallo di giorni. */
export function useWorkouts(from: LocalDate, to: LocalDate) {
  return useQuery(workoutsQuery(from, to));
}

/** La settimana (da lunedì a domenica) che contiene `day`: è l'intervallo che serve a Today e al riepilogo. */
export function useWeekWorkouts(day: LocalDate) {
  return useWorkouts(weekStart(day), endOfWeek(day));
}

/** Le ultime settimane fino alla fine di quella corrente: storico, suggerimenti delle discipline, Quick Capture. */
export function useRecentWorkouts(today: LocalDate) {
  return useWorkouts(addDays(weekStart(today), -7 * HISTORY_WEEKS), endOfWeek(today));
}

/** Azioni sugli allenamenti: l'interfaccia si aggiorna subito, l'invio al server segue appena c'è rete. */
export function useWorkoutActions() {
  const toast = useToast();

  async function apply(write: () => Promise<void>) {
    try {
      await write();
      return true;
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
      return false;
    }
  }

  const reopen = (workout: Workout) => apply(() => updateWorkout(workout, reopenWorkoutPatch()));

  async function complete(workout: Workout) {
    const ok = await apply(() => updateWorkout(workout, completeWorkoutPatch(new Date())));
    if (ok) toast({ message: "Allenamento fatto", actionLabel: "Annulla", onAction: () => apply(() => updateWorkout(workout, { status: workout.status, completed_at: workout.completed_at })) });
  }

  return {
    complete,
    reopen,
    toggle: (workout: Workout) => (workout.status === "done" ? reopen(workout) : complete(workout)),
    skip: (workout: Workout) => apply(() => updateWorkout(workout, skipWorkoutPatch())),
    moveTo: (workout: Workout, date: LocalDate) => apply(() => updateWorkout(workout, { date })),
    remove: (workout: Workout) => apply(() => removeWorkout(workout)),
  };
}
