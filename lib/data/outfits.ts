import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { Outfit, WardrobeItem, WardrobeStatus, WardrobeWear } from "../supabase/types";
import { commit, withPendingOutfits, withPendingWears } from "../sync/engine";
import { byId, type Op } from "../sync/ops";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const OUTFIT_COLUMNS = "id, name, item_ids, styles, occasions, seasons, favorite, notes, deleted_at, created_at, updated_at";
const WEAR_COLUMNS = "id, worn_on, outfit_id, item_ids, created_at";

export const OUTFITS_KEY = ["outfits"];
export const WEARS_KEY = ["wardrobe-wears"];

export async function fetchOutfits(): Promise<Outfit[]> {
  const rows: Outfit[] = check(await getSupabase().from("outfits").select(OUTFIT_COLUMNS).is("deleted_at", null).order("created_at", { ascending: false }));
  return withPendingOutfits(rows);
}

export async function fetchWears(): Promise<WardrobeWear[]> {
  const rows: WardrobeWear[] = check(
    await getSupabase().from("wardrobe_wears").select(WEAR_COLUMNS).order("worn_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
  );
  return withPendingWears(rows);
}

export type OutfitInput = Pick<Outfit, "name" | "item_ids" | "styles" | "occasions" | "seasons" | "favorite" | "notes">;

export async function createOutfit(input: OutfitInput): Promise<string> {
  const id = uuidv7();
  await commit([{ kind: "insert", table: "outfits", row: { id, ...input } }]);
  return id;
}

export async function updateOutfit(outfit: Outfit, patch: Partial<Outfit>): Promise<void> {
  await commit([{ kind: "update", table: "outfits", patch, where: byId(outfit.id), snapshot: { ...outfit, ...patch } }]);
}

/** Lo stato scelto per un capo dopo averlo indossato. */
export type WearChoice = { item: WardrobeItem; status: WardrobeStatus };

/**
 * Registra un utilizzo effettivo e porta ogni capo nello stato scelto, in un'unica scrittura.
 * Restituisce l'id dell'utilizzo, per poterlo annullare.
 */
export async function recordWear(outfitId: string | null, wornOn: string, choices: WearChoice[]): Promise<string> {
  const id = uuidv7();
  const ops: Op[] = [{ kind: "insert", table: "wardrobe_wears", row: { id, worn_on: wornOn, outfit_id: outfitId, item_ids: choices.map((c) => c.item.id) } }];
  for (const { item, status } of choices) {
    if (status !== item.status) ops.push({ kind: "update", table: "wardrobe_items", patch: { status }, where: byId(item.id), snapshot: { ...item, status } });
  }
  await commit(ops);
  return id;
}

/** Annulla un utilizzo appena registrato: toglie la voce dallo storico e riporta i capi allo stato di prima. */
export async function undoWear(wearId: string, choices: WearChoice[]): Promise<void> {
  const ops: Op[] = [{ kind: "delete", table: "wardrobe_wears", where: byId(wearId) }];
  for (const { item, status } of choices) {
    if (status !== item.status) ops.push({ kind: "update", table: "wardrobe_items", patch: { status: item.status }, where: byId(item.id), snapshot: item });
  }
  await commit(ops);
}
