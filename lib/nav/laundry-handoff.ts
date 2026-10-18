import type { WashGroup } from "../supabase/types";

/**
 * Richiesta di aprire "Lavatrice fatta" (D69): arriva da dove si completa un'attività (Oggi, Settimana,
 * Mese, ricerca) o dal Guardaroba, e la apre un solo foglio montato nella shell. Vive solo in memoria.
 */
export type LaundryDoneRequest = { group: WashGroup | null; taskId: string | null };

let current: LaundryDoneRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function requestLaundryDone(request: LaundryDoneRequest) {
  current = request;
  emit();
}

export function closeLaundryDone() {
  current = null;
  emit();
}

export function subscribeLaundryDone(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLaundryDone(): LaundryDoneRequest | null {
  return current;
}
