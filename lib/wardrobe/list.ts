import type { WardrobeItem } from "../supabase/types";
import { washGroupOf } from "./laundry";

export type WardrobeFilters = {
  categories?: string[];
  colors?: string[];
  seasons?: string[];
  styles?: string[];
  occasions?: string[];
  statuses?: string[];
  /** Gruppi di lavaggio (D69); "none" = senza gruppo. */
  washGroups?: string[];
  favoriteOnly?: boolean;
  text?: string;
};

function matchesAny(itemValues: string[], filterValues?: string[]): boolean {
  if (!filterValues || filterValues.length === 0) return true;
  return itemValues.some((v) => filterValues.includes(v));
}

/** I capi (non eliminati) che rispettano tutti i filtri attivi, dal più recente. */
export function filterWardrobe(items: WardrobeItem[], filters: WardrobeFilters): WardrobeItem[] {
  const text = filters.text?.trim().toLowerCase();
  return items
    .filter((i) => !i.deleted_at)
    .filter((i) => !filters.categories?.length || filters.categories.includes(i.category))
    .filter((i) => matchesAny(i.colors, filters.colors))
    .filter((i) => matchesAny(i.seasons, filters.seasons))
    .filter((i) => matchesAny(i.styles, filters.styles))
    .filter((i) => matchesAny(i.occasions, filters.occasions))
    .filter((i) => !filters.statuses?.length || filters.statuses.includes(i.status))
    .filter((i) => !filters.washGroups?.length || filters.washGroups.includes(washGroupOf(i) ?? "none"))
    .filter((i) => !filters.favoriteOnly || i.favorite)
    .filter((i) => !text || [i.name, i.brand, i.subcategory].some((v) => v?.toLowerCase().includes(text)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** I valori (colori, stagioni, stili, occasioni…) presenti tra i capi non eliminati, in ordine alfabetico. */
export function distinctValues(items: WardrobeItem[], pick: (item: WardrobeItem) => string[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.deleted_at) continue;
    for (const value of pick(item)) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}

/** Nome da proporre per la copia di un capo. */
export function duplicateName(name: string | null): string | null {
  if (!name) return null;
  return `${name} (copia)`;
}
