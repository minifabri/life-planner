import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { WardrobeItem, WishlistItem } from "../supabase/types";
import { commit, currentOwner, withPendingWardrobe } from "../sync/engine";
import { byId, type Row } from "../sync/ops";
import { compressImage } from "../wardrobe/image";
import { duplicateName } from "../wardrobe/list";
import { wardrobeRowFromWish } from "../wardrobe/wishlist";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const COLUMNS =
  "id, name, image_path, thumb_path, image_url, category, subcategory, colors, seasons, styles, occasions, material, brand, warmth, layerable, status, wash_group, favorite, notes, wishlist_item_id, deleted_at, created_at, updated_at";

export const WARDROBE_KEY = ["wardrobe-items"];

export async function fetchWardrobeItems(): Promise<WardrobeItem[]> {
  const rows: WardrobeItem[] = check(
    await getSupabase().from("wardrobe_items").select(COLUMNS).is("deleted_at", null).order("created_at", { ascending: false }),
  );
  return withPendingWardrobe(rows);
}

export type WardrobeInput = Pick<
  WardrobeItem,
  | "name"
  | "category"
  | "subcategory"
  | "colors"
  | "seasons"
  | "styles"
  | "occasions"
  | "material"
  | "brand"
  | "warmth"
  | "layerable"
  | "status"
  | "wash_group"
  | "favorite"
  | "notes"
  | "image_url"
>;

export async function createWardrobeItem(input: WardrobeInput): Promise<string> {
  const id = uuidv7();
  await commit([{ kind: "insert", table: "wardrobe_items", row: { id, ...input } }]);
  return id;
}

export async function updateWardrobeItem(item: WardrobeItem, patch: Partial<WardrobeItem>): Promise<void> {
  await commit([{ kind: "update", table: "wardrobe_items", patch, where: byId(item.id), snapshot: { ...item, ...patch } }]);
}

/** Porta nel guardaroba un articolo della wishlist, con i dati che ha già e il legame con l'articolo. */
export async function addWishToWardrobe(wish: WishlistItem): Promise<string> {
  const id = uuidv7();
  await commit([{ kind: "insert", table: "wardrobe_items", row: { id, ...wardrobeRowFromWish(wish) } }]);
  return id;
}

/** Copia un capo senza la foto propria (restano l'eventuale immagine esterna, i tag e i dettagli). */
export async function duplicateWardrobeItem(item: WardrobeItem): Promise<string> {
  const id = uuidv7();
  const row: Row & { id: string } = {
    id,
    name: duplicateName(item.name),
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    seasons: item.seasons,
    styles: item.styles,
    occasions: item.occasions,
    material: item.material,
    brand: item.brand,
    warmth: item.warmth,
    layerable: item.layerable,
    status: item.status,
    wash_group: item.wash_group,
    favorite: false,
    notes: item.notes,
    image_url: item.image_url,
  };
  await commit([{ kind: "insert", table: "wardrobe_items", row }]);
  return id;
}

/**
 * Comprime e carica la foto di un capo (originale + miniatura) nel bucket privato "wardrobe",
 * poi aggiorna il capo con i percorsi. Richiede la rete: l'upload non passa dalla outbox.
 */
export async function attachWardrobePhoto(itemId: string, file: File): Promise<void> {
  const owner = await currentOwner();
  if (!owner) throw new Error("Sessione mancante");
  const { main, thumb } = await compressImage(file);
  const storage = getSupabase().storage.from("wardrobe");
  const imagePath = `${owner}/${itemId}.jpg`;
  const thumbPath = `${owner}/${itemId}_thumb.jpg`;
  const [mainResult, thumbResult] = await Promise.all([
    storage.upload(imagePath, main, { contentType: "image/jpeg", upsert: true }),
    storage.upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: true }),
  ]);
  if (mainResult.error) throw new Error(mainResult.error.message);
  if (thumbResult.error) throw new Error(thumbResult.error.message);
  await commit([{ kind: "update", table: "wardrobe_items", patch: { image_path: imagePath, thumb_path: thumbPath }, where: byId(itemId) }]);
}

/** URL firmato (valido un'ora) per mostrare una foto del bucket privato. */
export async function fetchWardrobeImageUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from("wardrobe").createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "URL non disponibile");
  return data.signedUrl;
}

const PURGE_AFTER_DAYS = 7;

/**
 * Toglie dallo Storage le foto dei capi eliminati da più di una settimana (quando "Annulla" non serve più)
 * e ne azzera i percorsi. Richiede la rete; se fallisce si riprova alla prossima apertura.
 */
export async function purgeDeletedWardrobePhotos(now: Date = new Date()): Promise<void> {
  const before = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  const supabase = getSupabase();
  const rows: Pick<WardrobeItem, "id" | "image_path" | "thumb_path">[] = check(
    await supabase.from("wardrobe_items").select("id, image_path, thumb_path").lt("deleted_at", before).not("image_path", "is", null),
  );
  for (const row of rows) {
    const paths = [row.image_path, row.thumb_path].filter((p): p is string => !!p);
    const { error } = await supabase.storage.from("wardrobe").remove(paths);
    if (error) continue;
    await supabase.from("wardrobe_items").update({ image_path: null, thumb_path: null }).eq("id", row.id);
  }
}
