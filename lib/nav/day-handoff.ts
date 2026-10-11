import type { LocalDate } from "../dates/local";

/**
 * Passaggio del giorno scelto da Settimana, Mese o ricerca alla vista Giorno.
 * Vive solo in memoria: niente date nell'URL e niente da ripulire.
 */
let pending: LocalDate | null = null;
const listeners = new Set<() => void>();

export function openDayNext(day: LocalDate) {
  pending = day;
  for (const listener of listeners) listener();
}

/** Per la vista Giorno già aperta: avvisa quando viene chiesto un giorno (es. da un risultato della ricerca). */
export function onDayRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Il giorno da mostrare all'apertura della vista Giorno, se è stato chiesto; si legge una volta sola. */
export function takeRequestedDay(): LocalDate | null {
  const day = pending;
  pending = null;
  return day;
}
