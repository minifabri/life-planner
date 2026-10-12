import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { WishlistItem } from "../supabase/types";
import { commit, withPendingWishlist } from "../sync/engine";
import { byId, type Op } from "../sync/ops";
import type { ImportRow } from "../wishlist/chatgpt";
import { metadataPatch } from "../wishlist/list";
import type { LinkPreviewReply } from "../wishlist/metadata";
import { listId } from "./api";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const COLUMNS =
  "id, list_id, name, brand, category, url, price_amount, price_currency, price_is_estimate, image_url, notes, interest, status, source, garment, colors, styles, metadata_fetched_at, deleted_at, created_at";

export async function fetchWishlistItems(): Promise<WishlistItem[]> {
  const rows: WishlistItem[] = check(await getSupabase().from("wishlist_items").select(COLUMNS).is("deleted_at", null).order("created_at", { ascending: false }));
  // Postgres restituisce i numeric come testo: nell'app il prezzo è un numero.
  return withPendingWishlist(rows.map((r) => ({ ...r, price_amount: r.price_amount === null ? null : Number(r.price_amount) })));
}

export const WISHLIST_KEY = ["wishlist-items"];

export type WishlistInput = Pick<
  WishlistItem,
  "name" | "brand" | "category" | "url" | "price_amount" | "price_currency" | "price_is_estimate" | "image_url" | "notes" | "interest"
> &
  Partial<Pick<WishlistItem, "garment" | "colors" | "styles">>;

export async function createWishlistItems(inputs: (WishlistInput & Partial<Pick<WishlistItem, "source" | "metadata_fetched_at">>)[]): Promise<void> {
  if (inputs.length === 0) return;
  const list = await listId("wishlist");
  await commit(
    inputs.map((input): Op => ({ kind: "insert", table: "wishlist_items", row: { id: uuidv7(), list_id: list, source: input.url ? "link" : "manual", ...input } })),
  );
}

export async function importRows(rows: ImportRow[]): Promise<void> {
  await createWishlistItems(
    rows.map((r) => ({
      name: r.name,
      brand: r.brand,
      category: r.category,
      url: null,
      price_amount: r.price_amount,
      price_currency: r.price_currency,
      price_is_estimate: r.price_is_estimate,
      image_url: null,
      notes: r.notes,
      interest: 2 as const,
      source: "chatgpt" as const,
    })),
  );
}

export async function updateWishlistItem(item: WishlistItem, patch: Partial<WishlistItem>): Promise<void> {
  await commit([{ kind: "update", table: "wishlist_items", patch, where: byId(item.id), snapshot: { ...item, ...patch } }]);
}

/** Chiede al server dell'app di leggere la pagina del link. Serve la rete; l'indirizzo viaggia nel corpo della richiesta. */
export async function fetchLinkMetadata(url: string): Promise<LinkPreviewReply> {
  const { data } = await getSupabase().auth.getSession();
  const response = await fetch("/api/link-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ url }),
  });
  return (await response.json()) as LinkPreviewReply;
}

/**
 * Recupera i dati dal link di un articolo già salvato e riempie solo i campi vuoti.
 * Il tentativo viene segnato anche se la pagina non risponde, così non si riprova a ogni apertura.
 */
export async function refreshFromLink(item: WishlistItem): Promise<LinkPreviewReply> {
  const reply = await fetchLinkMetadata(item.url!);
  const patch = reply.ok ? metadataPatch(item, reply.metadata) : {};
  await updateWishlistItem(item, { ...patch, metadata_fetched_at: new Date().toISOString() });
  return reply;
}
