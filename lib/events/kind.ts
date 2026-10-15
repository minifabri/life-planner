import type { LocalDate } from "../dates/local";
import type { EventKind, EventRow } from "../supabase/types";
import type { Occurrence } from "./day";

/** Le spedizioni si riconoscono dal pacchetto a inizio titolo, come le scrive Bibi su Google Calendar. */
const SHIPMENT_PREFIX = /^\s*\u{1F4E6}\u{FE0F}?\s*/u;

/** Tipo di un evento letto da un calendario esterno o da un file: dal titolo. */
export function kindFromTitle(title: string): EventKind {
  return SHIPMENT_PREFIX.test(title) ? "shipment" : "event";
}

/** Il titolo da mostrare: senza il pacchetto, che l'icona sostituisce. */
export function displayTitle(event: Pick<EventRow, "title" | "kind">): string {
  if (event.kind !== "shipment") return event.title;
  return event.title.replace(SHIPMENT_PREFIX, "").trim() || event.title;
}

/** Spedizioni e compleanni non occupano la giornata: si mostrano a parte, in piccolo. */
export function isQuiet(kind: EventKind | undefined): boolean {
  return kind === "shipment" || kind === "birthday";
}

/** Separa le occorrenze discrete da quelle dell'agenda. */
export function splitQuiet(occurrences: Occurrence[]): { regular: Occurrence[]; quiet: Occurrence[] } {
  const regular: Occurrence[] = [];
  const quiet: Occurrence[] = [];
  for (const o of occurrences) (isQuiet(o.event.kind) ? quiet : regular).push(o);
  // Prima i compleanni, poi le spedizioni, ciascuno in ordine di titolo.
  quiet.sort((a, b) => Number(a.event.kind === "shipment") - Number(b.event.kind === "shipment") || displayTitle(a.event).localeCompare(displayTitle(b.event), "it"));
  return { regular, quiet };
}

/**
 * Ripetizione di un compleanno: ogni anno, nello stesso giorno.
 * Chi è nato il 29 febbraio lo festeggia l'ultimo giorno di febbraio, anche negli anni non bisestili.
 */
export function birthdayRule(date: LocalDate): string {
  return date.slice(5) === "02-29" ? "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "FREQ=YEARLY";
}

export const KIND_LABEL: Record<EventKind, string> = { event: "Evento", shipment: "Spedizione", birthday: "Compleanno" };
