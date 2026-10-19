import type { LocalDate } from "../dates/local";

/**
 * Il giorno da aprire nei Pasti, chiesto da un'altra schermata (es. "Cambiato" sui pasti di ieri, in Oggi).
 * Separato da quello della vista Giorno: le due pagine restano montate insieme e non devono rubarselo.
 */
let pending: LocalDate | null = null;
const listeners = new Set<() => void>();

export function openMealsDay(day: LocalDate) {
  pending = day;
  for (const listener of listeners) listener();
}

export function onMealsDayRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Si legge una volta sola. */
export function takeMealsDay(): LocalDate | null {
  const day = pending;
  pending = null;
  return day;
}
