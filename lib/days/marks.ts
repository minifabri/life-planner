import { trimTime, type LocalDate } from "../dates/local";
import type { DayMark, DayMarkKind, Workout } from "../supabase/types";
import { byId, type Op } from "../sync/ops";
import { isSavedMark } from "./travel";
import { shownStatus, workoutsOfDay } from "../workouts/summary";

/** I segni che si mettono a mano su un giorno, nell'ordine in cui si mostrano. */
export const MARK_KINDS: DayMarkKind[] = ["office", "travel"];

/** Ciò che un giorno può mostrare: i segni messi a mano e l'allenamento, che arriva dagli allenamenti in programma. */
export type DaySign = DayMarkKind | "workout";

export const SIGN_LABEL: Record<DaySign, string> = { office: "Ufficio", travel: "Viaggio", workout: "Allenamento" };

/** Gli allenamenti che contano per organizzare il giorno: in programma o fatti, non quelli saltati. */
export function dayWorkouts(workouts: Workout[], day: LocalDate, today: LocalDate): Workout[] {
  return workoutsOfDay(workouts, day).filter((w) => shownStatus(w, today) !== "skipped");
}

/** I segni di un giorno, sempre nello stesso ordine: ufficio, viaggio, allenamento. */
export function daySigns(day: LocalDate, marks: DayMark[], workouts: Workout[], today: LocalDate): DaySign[] {
  const signs: DaySign[] = MARK_KINDS.filter((kind) => marks.some((m) => m.date === day && m.kind === kind));
  if (dayWorkouts(workouts, day, today).length > 0) signs.push("workout");
  return signs;
}

/** Per chi non vede le icone: "ufficio, allenamento". Vuoto se il giorno non ha segni. */
export function signsText(signs: DaySign[]): string {
  return signs.map((s) => SIGN_LABEL[s].toLowerCase()).join(", ");
}

/** "Corsa 18:00": la disciplina e, se c'è, l'orario. */
export function workoutLabel(workout: Pick<Workout, "activity" | "time">): string {
  return workout.time ? `${workout.activity} ${trimTime(workout.time)}` : workout.activity;
}

/** Mette il segno se manca, lo toglie se c'è. `id` è quello della riga nuova, se serve. */
export function toggleMarkOp(marks: DayMark[], id: string, date: LocalDate, kind: DayMarkKind): Op {
  const existing = marks.find((m) => m.date === date && m.kind === kind && isSavedMark(m));
  if (existing) return { kind: "delete", table: "day_marks", where: byId(existing.id) };
  return { kind: "insert", table: "day_marks", row: { id, date, kind } };
}

/**
 * Cosa fa un tocco su un segno, tenendo conto del viaggio ricavato dal calendario (D72):
 * - il segno manca: si mette a mano;
 * - c'è ed è solo a mano: si toglie;
 * - c'è perché lo dice il calendario: si toglie la riga a mano, se c'è, e si ricorda "non in viaggio" per quel giorno
 *   (`dismiss`), così il segno automatico non torna.
 * `restore` sono le operazioni che rimettono le cose com'erano, per Annulla.
 */
export function toggleMarkPlan(
  marks: DayMark[],
  id: string,
  date: LocalDate,
  kind: DayMarkKind,
): { ops: Op[]; dismiss: boolean; restore: Op[] } {
  const shown = marks.find((m) => m.date === date && m.kind === kind);
  if (!shown?.auto) return { ops: [toggleMarkOp(marks, id, date, kind)], dismiss: false, restore: [] };
  const saved = isSavedMark(shown);
  return {
    ops: saved ? [{ kind: "delete", table: "day_marks", where: byId(shown.id) }] : [],
    dismiss: true,
    restore: saved ? [{ kind: "insert", table: "day_marks", row: { id: shown.id, date, kind } }] : [],
  };
}
