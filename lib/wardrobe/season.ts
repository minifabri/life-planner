import { addDays, type LocalDate } from "../dates/local";
import type { WardrobeItem } from "../supabase/types";
import { seasonOf, type Season } from "./suggest";

/** Quanti giorni prima e dopo il cambio di stagione valgono anche i capi della stagione vicina. */
const BRIDGE_DAYS = 15;

/**
 * Le stagioni di un giorno: la sua, più quella vicina nei giorni a cavallo del cambio
 * (a inizio settembre l'estate non è ancora finita, a fine novembre l'inverno è già arrivato).
 */
export function activeSeasons(date: LocalDate): Season[] {
  return [...new Set([seasonOf(addDays(date, -BRIDGE_DAYS)), seasonOf(date), seasonOf(addDays(date, BRIDGE_DAYS))])];
}

/** Un capo è di stagione se non ha stagioni indicate o ne ha almeno una tra quelle del giorno. */
export function isInSeason(item: Pick<WardrobeItem, "seasons">, seasons: Season[]): boolean {
  return item.seasons.length === 0 || item.seasons.some((s) => (seasons as string[]).includes(s));
}

/**
 * I capi di stagione e quelli fuori stagione, ciascuno nell'ordine ricevuto. La stagione è un'indicazione,
 * mai un vincolo: i capi fuori stagione restano a portata di mano, solo più in là.
 */
export function splitBySeason<T extends Pick<WardrobeItem, "seasons">>(items: T[], date: LocalDate): { current: T[]; other: T[] } {
  const seasons = activeSeasons(date);
  const current: T[] = [];
  const other: T[] = [];
  for (const item of items) (isInSeason(item, seasons) ? current : other).push(item);
  return { current, other };
}
