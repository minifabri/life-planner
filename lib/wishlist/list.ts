import type { WishlistItem, WishlistStatus } from "../supabase/types";
import type { LinkMetadata } from "./metadata";

export const STATUS_LABEL: Record<WishlistStatus, string> = {
  wanted: "Desiderati",
  bought: "Acquistati",
  discarded: "Scartati",
  arrived: "Da decidere",
  returning: "Da restituire",
  returned: "Restituiti",
};
export const INTEREST_LABEL: Record<1 | 2 | 3, string> = { 1: "Basso", 2: "Medio", 3: "Alto" };

/** Gli articoli di uno stato (ed eventualmente di una categoria), dal più desiderato; a parità il più recente. */
export function visibleItems(items: WishlistItem[], status: WishlistStatus, category: string | null): WishlistItem[] {
  return items
    .filter((i) => !i.deleted_at && i.status === status && (!category || i.category === category))
    .sort((a, b) => b.interest - a.interest || b.created_at.localeCompare(a.created_at));
}

/** Le categorie presenti tra gli articoli di uno stato, in ordine alfabetico. */
export function categoriesOf(items: WishlistItem[], status: WishlistStatus): string[] {
  const set = new Set(items.filter((i) => !i.deleted_at && i.status === status && i.category).map((i) => i.category!));
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

type Fillable = Pick<WishlistItem, "name" | "brand" | "image_url" | "price_amount" | "price_currency" | "price_is_estimate">;

/**
 * Cosa cambiare in un articolo con i dati arrivati dal link: si riempiono solo i campi vuoti,
 * ciò che è stato scritto a mano non viene toccato. Un nome uguale all'indirizzo conta come vuoto.
 */
export function metadataPatch(item: Fillable & { url: string | null }, meta: LinkMetadata): Partial<Fillable> {
  const patch: Partial<Fillable> = {};
  const placeholderName = !item.name.trim() || item.name.trim() === item.url || /^https?:\/\//i.test(item.name.trim());
  if (placeholderName && meta.title) patch.name = meta.title;
  if (!item.brand && meta.brand) patch.brand = meta.brand;
  if (!item.image_url && meta.image) patch.image_url = meta.image;
  if (item.price_amount === null && meta.price !== null) {
    patch.price_amount = meta.price;
    patch.price_currency = meta.currency ?? "EUR";
    patch.price_is_estimate = false;
  }
  return patch;
}

/** Per un articolo nato da un link già letto: cosa non è arrivato (per dirlo nell'interfaccia). */
export function missingFromLink(item: Pick<WishlistItem, "url" | "metadata_fetched_at" | "image_url" | "price_amount">): string[] {
  if (!item.url || !item.metadata_fetched_at) return [];
  return [item.image_url ? null : "immagine", item.price_amount === null ? "prezzo" : null].filter((x): x is string => x !== null);
}

/** Articoli con un link i cui dati non sono ancora stati chiesti (es. salvati dal Quick Capture o offline). */
export function awaitingMetadata(items: WishlistItem[]): WishlistItem[] {
  return items.filter((i) => !i.deleted_at && !!i.url && !i.metadata_fetched_at && i.source === "link");
}

/** Nome leggibile del sito di un link: "www.sephora.it" → "sephora.it". */
export function siteName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
