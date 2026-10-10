import { uuidv7 } from "../ids";
import { parseEntry } from "../shopping/entry";
import { getSupabase } from "../supabase/client";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { fetchLists } from "./api";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const ITEM_COLUMNS = "id, list_id, name, quantity, department, checked, checked_at, deleted_at, created_at";

export async function fetchShoppingItems(): Promise<ShoppingItem[]> {
  return check(await getSupabase().from("shopping_items").select(ITEM_COLUMNS).is("deleted_at", null).order("created_at"));
}

/** Il catalogo appreso: lo aggiorna il database a ogni articolo aggiunto, modificato o spuntato. */
export async function fetchProductMemory(): Promise<ProductMemory[]> {
  return check(await getSupabase().from("product_memory").select("id, display_name, department, use_count, last_used_at"));
}

export async function shoppingListId(): Promise<string> {
  const list = (await fetchLists()).find((l) => l.kind === "shopping");
  if (!list) throw new Error("Lista mancante: shopping");
  return list.id;
}

export type NewShoppingItem = Pick<ShoppingItem, "id" | "list_id" | "name" | "quantity" | "department">;

/** Senza reparto l'articolo eredita dal database quello imparato per lo stesso nome. */
export async function insertShoppingItem(item: NewShoppingItem): Promise<void> {
  check(await getSupabase().from("shopping_items").insert(item).select("id"));
}

/** Aggiunge ciò che è stato scritto ("2 latte" → latte, quantità 2) e restituisce l'id. */
export async function createShoppingItem(text: string): Promise<string> {
  const id = uuidv7();
  await insertShoppingItem({ id, list_id: await shoppingListId(), ...parseEntry(text), department: null });
  return id;
}

export type ShoppingPatch = Partial<Pick<ShoppingItem, "name" | "quantity" | "department" | "checked" | "checked_at" | "deleted_at">>;

export async function updateShoppingItems(ids: string[], patch: ShoppingPatch): Promise<void> {
  if (ids.length === 0) return;
  check(await getSupabase().from("shopping_items").update(patch).in("id", ids).select("id"));
}

/** Avvisa a ogni modifica della lista fatta altrove (un altro dispositivo aperto). Restituisce come smettere. */
export function subscribeToShoppingItems(onChange: () => void): () => void {
  const supabase = getSupabase();
  const channel = supabase
    .channel("shopping-items")
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
