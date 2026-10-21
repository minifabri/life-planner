import type { EventRow } from "../supabase/types";

/**
 * Lo stesso evento su Google e su iCloud (D73): capita quando la schedulazione scrive su Google Calendar e il
 * telefono ha già l'evento nel calendario di iCloud (per esempio un volo aggiunto da Wallet o dalla mail).
 * Si mostra solo quello di Google, che ha emoji e categoria; quello di iCloud resta nei dati e torna visibile
 * se l'evento di Google sparisce.
 */

/** Scarto massimo tra gli orari di due copie dello stesso evento: le fonti arrotondano in modo diverso. */
const TOLERANCE_MS = 30 * 60_000;

/** Le parole del titolo che contano: almeno tre caratteri, senza accenti, codici del volo compresi ("ca939"). */
function titleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3),
  );
}

function close(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= TOLERANCE_MS;
}

/** Due eventi nello stesso momento, con almeno una parola del titolo in comune. */
export function isSameEvent(a: EventRow, b: EventRow): boolean {
  if (a.rrule || b.rrule || a.all_day !== b.all_day) return false;
  const sameTime = a.all_day
    ? a.start_date === b.start_date && (a.end_date ?? a.start_date) === (b.end_date ?? b.start_date)
    : close(a.start_at, b.start_at) && close(a.end_at ?? a.start_at, b.end_at ?? b.start_at);
  if (!sameTime) return false;
  const words = titleWords(b.title);
  return [...titleWords(a.title)].some((w) => words.has(w));
}

/** Gli eventi senza le copie iCloud di un evento di Google. */
export function withoutIcloudDuplicates<T extends EventRow>(events: T[]): T[] {
  const google = events.filter((e) => e.source === "gcal" && !e.deleted_at);
  if (google.length === 0) return events;
  return events.filter((e) => e.source !== "icloud" || !google.some((g) => isSameEvent(e, g)));
}
