import type { LocalDate } from "../dates/local";

/**
 * Passaggio del giorno scelto da Settimana o Mese alla vista Giorno.
 * Vive solo in memoria: niente date nell'URL e niente da ripulire.
 */
let pending: LocalDate | null = null;

export function openDayNext(day: LocalDate) {
  pending = day;
}

/** Il giorno da mostrare all'apertura della vista Giorno, se è stato chiesto; si legge una volta sola. */
export function takeRequestedDay(): LocalDate | null {
  const day = pending;
  pending = null;
  return day;
}
