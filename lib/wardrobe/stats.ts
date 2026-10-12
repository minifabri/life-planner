import { diffDays, type LocalDate } from "../dates/local";
import type { Outfit, WardrobeItem, WardrobeWear } from "../supabase/types";

/** Quante volte e quando, per l'ultima volta, un capo o un outfit è stato indossato. */
export type Usage = { count: number; last: LocalDate | null };

const NONE: Usage = { count: 0, last: null };
const TOP = 5;
const FORGOTTEN_DAYS = 60;
const RECENT_DAYS = 30;

function bump(map: Map<string, Usage>, id: string, day: LocalDate) {
  const current = map.get(id) ?? NONE;
  map.set(id, { count: current.count + 1, last: !current.last || day > current.last ? day : current.last });
}

/** Utilizzi per capo: un capo indossato due volte nello stesso giorno conta due. */
export function itemUsage(wears: WardrobeWear[]): Map<string, Usage> {
  const map = new Map<string, Usage>();
  for (const wear of wears) for (const id of new Set(wear.item_ids)) bump(map, id, wear.worn_on);
  return map;
}

export function outfitUsage(wears: WardrobeWear[]): Map<string, Usage> {
  const map = new Map<string, Usage>();
  for (const wear of wears) if (wear.outfit_id) bump(map, wear.outfit_id, wear.worn_on);
  return map;
}

export type WardrobeStats = {
  /** Il primo giorno con un utilizzo registrato: prima di allora non si sa nulla. `null` se lo storico è vuoto. */
  since: LocalDate | null;
  items: number;
  outfits: number;
  /** Capi indossati almeno una volta negli ultimi 30 giorni. */
  wornRecently: number;
  mostWorn: { item: WardrobeItem; usage: Usage }[];
  /** Capi mai indossati da quando si registrano gli utilizzi, dal più vecchio. */
  neverWorn: WardrobeItem[];
  /** Capi indossati, ma non negli ultimi 60 giorni, da quello fermo da più tempo. */
  forgotten: { item: WardrobeItem; usage: Usage }[];
  /** Capi che non compaiono in nessun outfit salvato e non sono mai stati indossati insieme ad altri. */
  unpaired: WardrobeItem[];
  topOutfits: { outfit: Outfit; usage: Usage }[];
};

/** Le statistiche del guardaroba: poche, e solo ciò che lo storico permette di dire. */
export function wardrobeStats(items: WardrobeItem[], outfits: Outfit[], wears: WardrobeWear[], today: LocalDate): WardrobeStats {
  const owned = items.filter((i) => !i.deleted_at);
  const saved = outfits.filter((o) => !o.deleted_at);
  const usage = itemUsage(wears);
  const byOutfit = outfitUsage(wears);
  const since = wears.reduce<LocalDate | null>((first, w) => (!first || w.worn_on < first ? w.worn_on : first), null);

  const used = owned.map((item) => ({ item, usage: usage.get(item.id) ?? NONE })).filter((e) => e.usage.count > 0);
  const paired = new Set<string>();
  for (const outfit of saved) if (outfit.item_ids.length > 1) for (const id of outfit.item_ids) paired.add(id);
  for (const wear of wears) if (wear.item_ids.length > 1) for (const id of wear.item_ids) paired.add(id);

  return {
    since,
    items: owned.length,
    outfits: saved.length,
    wornRecently: used.filter((e) => e.usage.last && diffDays(today, e.usage.last) < RECENT_DAYS).length,
    mostWorn: [...used].sort((a, b) => b.usage.count - a.usage.count || (b.usage.last ?? "").localeCompare(a.usage.last ?? "") || a.item.id.localeCompare(b.item.id)).slice(0, TOP),
    neverWorn: owned.filter((i) => !usage.has(i.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    forgotten: used
      .filter((e) => e.usage.last && diffDays(today, e.usage.last) >= FORGOTTEN_DAYS)
      .sort((a, b) => (a.usage.last ?? "").localeCompare(b.usage.last ?? "")),
    unpaired: owned.filter((i) => !paired.has(i.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    topOutfits: saved
      .map((outfit) => ({ outfit, usage: byOutfit.get(outfit.id) ?? NONE }))
      .filter((e) => e.usage.count > 0)
      .sort((a, b) => b.usage.count - a.usage.count || (b.usage.last ?? "").localeCompare(a.usage.last ?? ""))
      .slice(0, TOP),
  };
}

/** "3 volte", "una volta". */
export function timesLabel(count: number): string {
  return count === 1 ? "una volta" : `${count} volte`;
}
