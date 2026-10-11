import type { Outfit, WardrobeCategory, WardrobeItem, WardrobeStatus, WardrobeWear } from "../supabase/types";

/** Ordine di lettura della moodboard: dall'esterno verso l'interno, poi scarpe e accessori. */
const BOARD_ORDER: WardrobeCategory[] = ["outerwear", "top", "dress", "bottom", "shoes", "bag", "accessory", "other"];

/** I capi nell'ordine in cui la moodboard li mostra; a parità di categoria resta l'ordine di inserimento. */
export function orderForBoard<T extends Pick<WardrobeItem, "category">>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => BOARD_ORDER.indexOf(a.item.category) - BOARD_ORDER.indexOf(b.item.category) || a.index - b.index)
    .map((e) => e.item);
}

/** I capi di un outfit ancora presenti nel guardaroba (ordinati per la moodboard) e quanti non ci sono più. */
export function resolveItems(itemIds: string[], items: WardrobeItem[]): { items: WardrobeItem[]; missing: number } {
  const byId = new Map(items.filter((i) => !i.deleted_at).map((i) => [i.id, i]));
  const found = itemIds.map((id) => byId.get(id)).filter((i): i is WardrobeItem => !!i);
  return { items: orderForBoard(found), missing: itemIds.length - found.length };
}

/** Sostituisce un capo mantenendo la posizione; se il nuovo c'è già, toglie soltanto il vecchio. */
export function replaceItem(itemIds: string[], oldId: string, newId: string): string[] {
  if (oldId === newId) return itemIds;
  if (itemIds.includes(newId)) return itemIds.filter((id) => id !== oldId);
  return itemIds.map((id) => (id === oldId ? newId : id));
}

export function toggleItem(itemIds: string[], id: string): string[] {
  return itemIds.includes(id) ? itemIds.filter((i) => i !== id) : [...itemIds, id];
}

/**
 * Etichette da proporre per l'outfit: quelle condivise da almeno metà dei capi che ne dichiarano
 * (un capo senza etichette non esprime un parere), dalla più frequente.
 */
export function commonTags(lists: string[][]): string[] {
  const declared = lists.filter((l) => l.length > 0);
  if (declared.length === 0) return [];
  const count = new Map<string, number>();
  for (const list of declared) for (const value of new Set(list)) count.set(value, (count.get(value) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n * 2 >= declared.length)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .map(([value]) => value);
}

/** Punto di partenza per stili, occasioni e stagioni di un outfit, ricavato dai suoi capi: sempre correggibile. */
export function suggestOutfitTags(items: WardrobeItem[]): Pick<Outfit, "styles" | "occasions" | "seasons"> {
  return {
    styles: commonTags(items.map((i) => i.styles)),
    occasions: commonTags(items.map((i) => i.occasions)),
    seasons: commonTags(items.map((i) => i.seasons)),
  };
}

/** Quanti capi dell'outfit sono da lavare: l'outfit si segnala, non si nasconde. */
export function toWashCount(items: WardrobeItem[]): number {
  return items.filter((i) => i.status === "to_wash").length;
}

/** Categorie che dopo un utilizzo di norma non cambiano stato. */
const KEEPS_STATUS: WardrobeCategory[] = ["outerwear", "shoes", "bag", "accessory"];

/** Stato proposto per un capo appena indossato: mai "da lavare" in automatico, lo decide chi l'ha indossato. */
export function statusAfterWear(item: Pick<WardrobeItem, "category" | "status">): WardrobeStatus {
  if (item.status === "to_wash") return "to_wash";
  return KEEPS_STATUS.includes(item.category) ? item.status : "worn";
}

/** Gli utilizzi di un outfit, dal più recente. */
export function wearsOf(wears: WardrobeWear[], outfitId: string): WardrobeWear[] {
  return wears.filter((w) => w.outfit_id === outfitId).sort((a, b) => b.worn_on.localeCompare(a.worn_on));
}

/** Outfit non eliminati che contengono il testo nel nome o in un'etichetta, i preferiti prima, poi i più recenti. */
export function filterOutfits(outfits: Outfit[], text: string): Outfit[] {
  const needle = text.trim().toLowerCase();
  return outfits
    .filter((o) => !o.deleted_at)
    .filter((o) => !needle || [o.name ?? "", ...o.styles, ...o.occasions].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.created_at.localeCompare(a.created_at));
}
