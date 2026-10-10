import { RRule } from "rrule";
import { addDays, type LocalDate } from "../dates/local";
import type { Recurrence } from "../supabase/types";

function utc(d: LocalDate): Date {
  return new Date(`${d}T00:00:00Z`);
}

/**
 * Date locali delle occorrenze di una RRULE tra `from` e `to` (inclusi).
 * Il calcolo è fatto su date "fluttuanti" in UTC: l'ora legale non sposta i giorni.
 */
export function occurrenceDates(rrule: string, start: LocalDate, from: LocalDate, to: LocalDate): LocalDate[] {
  if (to < from || to < start) return [];
  const options = RRule.parseString(rrule.replace(/^RRULE:/i, ""));
  const rule = new RRule({ ...options, dtstart: utc(start) });
  return rule.between(utc(from), utc(to), true).map((d) => d.toISOString().slice(0, 10));
}

/** Vero se la serie ha almeno un'occorrenza da `from` in poi. */
export function hasOccurrenceFrom(rrule: string, start: LocalDate, from: LocalDate): boolean {
  const options = RRule.parseString(rrule.replace(/^RRULE:/i, ""));
  return new RRule({ ...options, dtstart: utc(start) }).after(utc(from), true) !== null;
}

/** Giorni di anticipo con cui si creano le attività ricorrenti a calendario fisso. */
export const MATERIALIZE_DAYS = 14;

/**
 * Date delle attività da creare per una ricorrenza fissa: da oggi ai prossimi 14 giorni,
 * dopo la prima attività (che esiste già) e non oltre la fine della ricorrenza.
 */
export function datesToMaterialize(
  recurrence: Pick<Recurrence, "kind" | "rrule" | "active" | "until" | "template">,
  today: LocalDate,
): LocalDate[] {
  if (recurrence.kind !== "fixed" || !recurrence.rrule || !recurrence.active) return [];
  const start = recurrence.template.start_date;
  const from = addDays(start, 1) > today ? addDays(start, 1) : today;
  let to = addDays(today, MATERIALIZE_DAYS);
  if (recurrence.until && recurrence.until < to) to = recurrence.until;
  return occurrenceDates(recurrence.rrule, start, from, to);
}

/** Data della prossima attività di una ricorrenza "dopo il completamento". */
export function nextAfterCompletion(
  recurrence: Pick<Recurrence, "kind" | "interval_days" | "active" | "until">,
  completedOn: LocalDate,
): LocalDate | null {
  if (recurrence.kind !== "after_completion" || !recurrence.interval_days || !recurrence.active) return null;
  const next = addDays(completedOn, recurrence.interval_days);
  return recurrence.until && next > recurrence.until ? null : next;
}
