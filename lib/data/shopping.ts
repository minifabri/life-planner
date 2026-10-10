import { uuidv7 } from "../ids";
import { parseEntry } from "../shopping/entry";
import { getSupabase } from "../supabase/client";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { commit, withPendingShopping } from "../sync/engine";
import { byId } from "../sync/ops";
import { listId } from "./api";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const ITEM_COLUMNS = "id, list_id, name, quantity, department, checked, checked_at, deleted_at, created_at";

export async function fetchShoppingItems(): Promise<ShoppingItem[]> {
  return withPendingShopping(
    check(await getSupabase().from("shopping_items").select(ITEM_COLUMNS).is("deleted_at", null).order("created_at")),
  );
}

/** Il catalogo appreso: lo aggiorna il database a ogni articolo aggiunto, modificato o spuntato. */
export async function fetchProductMemory(): Promise<ProductMemory[]> {
  return check(await getSupabase().from("product_memory").select("id, display_name, department, use_count, last_used_at"));
}

export function shoppingListId(): Promise<string> {
  return listId("shopping");
}

export type NewShoppingItem = Pick<ShoppingItem, "id" | "list_id" | "name" | "quantity" | "department">;

/** Senza reparto l'articolo eredita dal database quello imparato per lo stesso nome. */
export async function insertShoppingItem(item: NewShoppingItem): Promise<void> {
  await commit([{ kind: "insert", table: "shopping_items", row: item }]);
}

/** Aggiunge ciò che è stato scritto ("2 latte" → latte, quantità 2) e restituisce l'id. */
export async function createShoppingItem(text: string): Promise<string> {
  const id = uuidv7();
  await insertShoppingItem({ id, list_id: await shoppingListId(), ...parseEntry(text), department: null });
  return id;
}

export type ShoppingPatch = Partial<Pick<ShoppingItem, "name" | "quantity" | "department" | "checked" | "checked_at" | "deleted_at">>;

/** Modifica più articoli insieme. Passare gli articoli interi permette di rimetterli subito in lista (annulla). */
export async function updateShoppingItems(items: (Pick<ShoppingItem, "id"> | ShoppingItem)[], patch: ShoppingPatch): Promise<void> {
  await commit(
    items.map((item) => ({
      kind: "update" as const,
      table: "shopping_items" as const,
      patch,
      where: byId(item.id),
      snapshot: "name" in item ? { ...item, ...patch } : undefined,
    })),
  );
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
