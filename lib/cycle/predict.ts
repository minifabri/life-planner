import { addDays, diffDays, type LocalDate } from "../dates/local";

/**
 * Previsione del ciclo dalle registrazioni del Log (D68). Modulo puro, solo calendario:
 * nessun dato di salute oltre ai giorni registrati, nessun servizio esterno.
 *
 * - Le registrazioni di giorni vicini (al più un giorno di pausa) sono lo stesso ciclo: chi registra
 *   solo l'inizio e chi registra ogni giorno ottengono la stessa previsione.
 * - Durata del ciclo: media degli ultimi sei intervalli tra un inizio e il successivo, tra 18 e 50 giorni
 *   (fuori da lì è quasi sempre un ciclo non registrato). Senza intervalli validi, 28.
 * - Durata delle mestruazioni: media dei cicli registrati giorno per giorno; altrimenti 5.
 * - Ovulazione stimata 14 giorni prima dell'inizio successivo; giorni fertili dai 5 giorni prima al giorno dopo.
 *
 * È una stima del calendario, non un metodo contraccettivo: l'interfaccia lo dice.
 */

export const DEFAULT_CYCLE_DAYS = 28;
export const DEFAULT_PERIOD_DAYS = 5;
const MIN_CYCLE = 18;
const MAX_CYCLE = 50;
const RECENT_CYCLES = 6;
const LUTEAL_DAYS = 14;
const FERTILE_BEFORE = 5;
const FERTILE_AFTER = 1;
/** Oltre questo ritardo la previsione non insegue più il giorno di oggi: probabilmente manca una registrazione. */
const MAX_LATE_DAYS = 14;

/** Nomi di categoria del Log che contano come ciclo ("Ciclo" è tra le predefinite). */
export function isCycleCategory(name: string): boolean {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return /^(ciclo|mestruazion|period)/.test(plain);
}

export type Period = { start: LocalDate; end: LocalDate };

/** Giorni registrati → cicli, dal più vecchio. Due giorni con al più un giorno in mezzo appartengono allo stesso ciclo. */
export function periodsFrom(dates: LocalDate[]): Period[] {
  const days = [...new Set(dates)].sort();
  const out: Period[] = [];
  for (const day of days) {
    const last = out[out.length - 1];
    if (last && diffDays(day, last.end) <= 2) last.end = day;
    else out.push({ start: day, end: day });
  }
  return out;
}

export type CycleStats = {
  /** Durata media del ciclo in giorni. */
  cycleDays: number;
  /** Durata media delle mestruazioni in giorni. */
  periodDays: number;
  /** Quanti intervalli tra cicli registrati sono serviti per la media (0 = valore predefinito). */
  basedOn: number;
};

function mean(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function cycleStats(periods: Period[]): CycleStats {
  const gaps: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = diffDays(periods[i].start, periods[i - 1].start);
    if (gap >= MIN_CYCLE && gap <= MAX_CYCLE) gaps.push(gap);
  }
  const recent = gaps.slice(-RECENT_CYCLES);
  // Un ciclo di un giorno solo vuol dire "registrato solo l'inizio": non dice quanto dura.
  const lengths = periods.map((p) => diffDays(p.end, p.start) + 1).filter((n) => n > 1 && n <= 10);
  return {
    cycleDays: recent.length ? mean(recent) : DEFAULT_CYCLE_DAYS,
    periodDays: lengths.length ? mean(lengths.slice(-RECENT_CYCLES)) : DEFAULT_PERIOD_DAYS,
    basedOn: recent.length,
  };
}

export type CyclePrediction = CycleStats & {
  /** Giorni di ciclo previsto nell'intervallo richiesto (mai quelli già registrati, mai prima di oggi). */
  period: Set<LocalDate>;
  /** Giorni fertili stimati nell'intervallo richiesto, dopo l'ultimo ciclo registrato. */
  fertile: Set<LocalDate>;
  /** Inizio del prossimo ciclo previsto. */
  nextStart: LocalDate;
  /** Giorni di ritardo rispetto alla previsione (0 se non è in ritardo). */
  lateDays: number;
};

/**
 * Previsione per i giorni da `from` a `to` (inclusi), a partire dai giorni registrati.
 * Null senza registrazioni.
 */
export function predictCycle(dates: LocalDate[], today: LocalDate, from: LocalDate, to: LocalDate): CyclePrediction | null {
  const periods = periodsFrom(dates);
  const last = periods[periods.length - 1];
  if (!last) return null;
  const stats = cycleStats(periods);
  const recorded = new Set(dates);
  const period = new Set<LocalDate>();
  const fertile = new Set<LocalDate>();

  const expected = addDays(last.start, stats.cycleDays);
  // In ritardo: il ciclo è atteso da un giorno all'altro, quindi la previsione parte da oggi.
  // Se è passato troppo tempo manca quasi certamente una registrazione: si resta sul calendario.
  const late = today > expected && today > last.end ? diffDays(today, expected) : 0;
  const nextStart = late > 0 && late <= MAX_LATE_DAYS ? today : expected;

  const inRange = (d: LocalDate) => d >= from && d <= to;

  // Il ciclo in corso: i giorni fertili stanno prima dell'inizio successivo, calcolato sul calendario.
  for (let k = 0, start = nextStart, nominal = expected; start <= addDays(to, LUTEAL_DAYS + FERTILE_AFTER); k++) {
    const ovulation = addDays(nominal, -LUTEAL_DAYS);
    for (let d = addDays(ovulation, -FERTILE_BEFORE); d <= addDays(ovulation, FERTILE_AFTER); d = addDays(d, 1)) {
      if (d > last.end && inRange(d) && !recorded.has(d)) fertile.add(d);
    }
    for (let i = 0; i < stats.periodDays; i++) {
      const d = addDays(start, i);
      if (d >= today && inRange(d) && !recorded.has(d)) period.add(d);
    }
    start = addDays(start, stats.cycleDays);
    nominal = start;
    if (k > 24) break;
  }
  for (const d of period) fertile.delete(d);

  return { ...stats, period, fertile, nextStart, lateDays: late };
}
