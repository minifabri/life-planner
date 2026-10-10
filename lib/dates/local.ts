import { TZDate } from "@date-fns/tz";
import { DEFAULT_TZ } from "./today";

/** Data locale senza fuso, nel formato YYYY-MM-DD. Si confronta come stringa. */
export type LocalDate = string;

const DAY_MS = 86_400_000;

function toUtc(d: LocalDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtc(toUtc(d) + n * DAY_MS);
}

/** Giorni da `b` ad `a` (positivo se `a` viene dopo). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}

/** Giorno della settimana ISO: 1 = lunedì … 7 = domenica. */
export function isoWeekday(d: LocalDate): number {
  return new Date(toUtc(d)).getUTCDay() || 7;
}

/** Prima data con il giorno della settimana indicato, strettamente dopo `d`. */
export function nextWeekday(d: LocalDate, weekday: number): LocalDate {
  const delta = (weekday - isoWeekday(d) + 7) % 7 || 7;
  return addDays(d, delta);
}

/** La domenica della settimana di `d` (lo stesso giorno se è domenica). */
export function endOfWeek(d: LocalDate): LocalDate {
  return addDays(d, 7 - isoWeekday(d));
}

export function endOfMonth(d: LocalDate): LocalDate {
  const [y, m] = d.split("-").map(Number);
  return fromUtc(Date.UTC(y, m, 0));
}

function fmt(d: LocalDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "UTC" }).format(toUtc(d));
}

export function weekdayName(d: LocalDate): string {
  return fmt(d, { weekday: "long" });
}

/** "9 ott" */
export function shortDate(d: LocalDate): string {
  return fmt(d, { day: "numeric", month: "short" }).replace(".", "");
}

/** Data relativa a oggi: "oggi", "domani", "ieri", "giovedì", "20 ott". */
export function relativeDay(d: LocalDate, today: LocalDate): string {
  const delta = diffDays(d, today);
  if (delta === 0) return "oggi";
  if (delta === 1) return "domani";
  if (delta === -1) return "ieri";
  if (delta > 1 && delta < 7) return weekdayName(d);
  return shortDate(d);
}

/** Etichetta di una finestra: "entro domenica", "entro fine mese", "entro il 20 ott". */
export function dueLabel(due: LocalDate, today: LocalDate): string {
  const delta = diffDays(due, today);
  if (delta === 0) return "entro oggi";
  if (delta === 1) return "entro domani";
  if (delta > 1 && delta < 7) return `entro ${weekdayName(due)}`;
  if (delta >= 7 && due === endOfMonth(today)) return "entro fine mese";
  return `entro il ${shortDate(due)}`;
}

/** Istante in cui inizia il giorno locale nel fuso indicato. */
export function startOfLocalDay(d: LocalDate, tz: string = DEFAULT_TZ): Date {
  return atLocalTime(d, "00:00", tz);
}

/** Istante corrispondente a una data e un'ora locali ("HH:mm") nel fuso indicato. */
export function atLocalTime(d: LocalDate, time: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, day, hh, mm, 0, tz).getTime());
}

/** Ora locale "HH:mm" di un istante nel fuso indicato. */
export function localTimeString(instant: Date, tz: string = DEFAULT_TZ): string {
  const d = new TZDate(instant.getTime(), tz);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "17:00:00" → "17:00" */
export function trimTime(time: string): string {
  return time.slice(0, 5);
}

/** Minuti in forma leggibile: 45 → "45 min", 90 → "1 h 30". */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest}` : `${h} h`;
}
