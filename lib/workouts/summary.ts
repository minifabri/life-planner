import { addDays, formatDuration, weekStart, type LocalDate } from "../dates/local";
import type { Workout, WorkoutStatus } from "../supabase/types";

/** Discipline proposte finché l'uso non ne insegna altre. */
export const DEFAULT_ACTIVITIES = ["Allenamento", "Corsa", "Camminata", "Forza", "Palestra", "Pilates", "Nuoto", "Bici"];

/** Parole che fanno riconoscere un allenamento al Quick Capture, oltre alle discipline già usate. */
export const WORKOUT_WORDS = [...DEFAULT_ACTIVITIES, "Pesi", "Cardio", "Stretching", "Workout", "Hiit"];

/**
 * Lo stato da mostrare: un allenamento pianificato in un giorno passato vale come saltato,
 * senza scriverlo e senza finire tra le cose rimaste indietro.
 */
export function shownStatus(workout: Pick<Workout, "status" | "date">, today: LocalDate): WorkoutStatus {
  return workout.status === "planned" && workout.date < today ? "skipped" : workout.status;
}

function byTime(a: Workout, b: Workout): number {
  // Prima quelli con orario, in ordine; poi gli altri, nell'ordine in cui sono nati.
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time || b.time) return a.time ? -1 : 1;
  return a.created_at.localeCompare(b.created_at);
}

export function workoutsOfDay(workouts: Workout[], day: LocalDate): Workout[] {
  return workouts.filter((w) => !w.deleted_at && w.date === day).sort(byTime);
}

export type WorkoutSummary = {
  /** Sessioni fatte. */
  done: number;
  /** Sessioni del periodo, fatte o no. */
  total: number;
  /** Minuti delle sessioni fatte. */
  minutes: number;
};

/** Riepilogo dei giorni da `from` a `to`, inclusi. */
export function summarize(workouts: Workout[], from: LocalDate, to: LocalDate): WorkoutSummary {
  const inRange = workouts.filter((w) => !w.deleted_at && w.date >= from && w.date <= to);
  const done = inRange.filter((w) => w.status === "done");
  return { done: done.length, total: inRange.length, minutes: done.reduce((sum, w) => sum + (w.duration_min ?? 0), 0) };
}

/** "2 di 3 · 1 h 30"; con una sola sessione non fatta "0 di 1". */
export function summaryLabel(summary: WorkoutSummary): string {
  const count = `${summary.done} di ${summary.total}`;
  return summary.minutes ? `${count} · ${formatDuration(summary.minutes)}` : count;
}

export type WorkoutWeek = { from: LocalDate; to: LocalDate; workouts: Workout[]; summary: WorkoutSummary };

/** Lo storico per settimane, dalla più recente; le settimane vuote non compaiono. */
export function groupByWeek(workouts: Workout[]): WorkoutWeek[] {
  const weeks = new Map<LocalDate, Workout[]>();
  for (const w of workouts) {
    if (w.deleted_at) continue;
    const from = weekStart(w.date);
    weeks.set(from, [...(weeks.get(from) ?? []), w]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([from, list]) => {
      const to = addDays(from, 6);
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || byTime(a, b));
      return { from, to, workouts: sorted, summary: summarize(list, from, to) };
    });
}

/**
 * Discipline da proporre: prima quelle usate, dalla più frequente, poi le predefinite.
 * Si impara solo da ciò che è stato scritto nell'app, non dai nomi che arrivano da Salute.
 */
export function activitySuggestions(workouts: Pick<Workout, "activity" | "source" | "deleted_at">[], defaults: string[] = DEFAULT_ACTIVITIES): string[] {
  const used = new Map<string, { name: string; count: number }>();
  for (const w of workouts) {
    if (w.deleted_at || w.source !== "app") continue;
    const name = w.activity.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    used.set(key, { name: used.get(key)?.name ?? name, count: (used.get(key)?.count ?? 0) + 1 });
  }
  const learned = [...used.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it")).map((u) => u.name);
  return [...learned, ...defaults.filter((d) => !used.has(d.toLowerCase()))];
}

/** 5200 → "5,2 km"; 800 → "800 m". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(Math.round(meters / 100) / 10).toString().replace(".", ",")} km`;
}

/** "5,2" o "5.2" (chilometri) → metri; vuoto o non valido → null. */
export function parseKm(text: string): number | null {
  const km = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : null;
}

export function completeWorkoutPatch(now: Date): Partial<Workout> {
  return { status: "done", completed_at: now.toISOString() };
}

export function reopenWorkoutPatch(): Partial<Workout> {
  return { status: "planned", completed_at: null };
}

export function skipWorkoutPatch(): Partial<Workout> {
  return { status: "skipped", completed_at: null };
}
