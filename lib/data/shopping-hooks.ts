"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { uuidv7 } from "../ids";
import { normalizeName, parseEntry, type Entry } from "../shopping/entry";
import { learnedDepartment } from "../shopping/list";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import {
  fetchProductMemory,
  fetchShoppingItems,
  insertShoppingItem,
  shoppingListId,
  subscribeToShoppingItems,
  updateShoppingItems,
  type ShoppingPatch,
} from "./shopping";

const ITEMS_KEY = ["shopping-items"];
const MEMORY_KEY = ["product-memory"];

/** Scritture in corso: finché ce ne sono, gli avvisi Realtime non ricaricano la lista sopra le modifiche locali. */
let pendingWrites = 0;

export function useShoppingItems() {
  const qc = useQueryClient();
  useEffect(
    () =>
      subscribeToShoppingItems(() => {
        if (pendingWrites > 0) return;
        qc.invalidateQueries({ queryKey: ITEMS_KEY });
        qc.invalidateQueries({ queryKey: MEMORY_KEY });
      }),
    [qc],
  );
  return useQuery({ queryKey: ITEMS_KEY, queryFn: fetchShoppingItems });
}

export function useProductMemory() {
  return useQuery({ queryKey: MEMORY_KEY, queryFn: fetchProductMemory, staleTime: 5 * 60_000 });
}

export function useInvalidateShopping() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ITEMS_KEY });
    qc.invalidateQueries({ queryKey: MEMORY_KEY });
  };
}

/** Azioni sulla lista con aggiornamento immediato dell'interfaccia. */
export function useShoppingActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const listId = useRef<string | null>(null);

  async function apply(change: (items: ShoppingItem[]) => ShoppingItem[], write: () => Promise<void>): Promise<boolean> {
    pendingWrites += 1;
    await qc.cancelQueries({ queryKey: ITEMS_KEY });
    qc.setQueryData<ShoppingItem[]>(ITEMS_KEY, (old) => (old ? change(old) : old));
    try {
      await write();
      return true;
    } catch {
      toast({ message: "Modifica non salvata. Controlla la connessione e riprova.", tone: "warn" });
      return false;
    } finally {
      pendingWrites -= 1;
      if (pendingWrites === 0) {
        qc.invalidateQueries({ queryKey: ITEMS_KEY });
        qc.invalidateQueries({ queryKey: MEMORY_KEY });
      }
    }
  }

  function patch(ids: string[], change: ShoppingPatch) {
    const set = new Set(ids);
    return apply(
      (items) => items.flatMap((i) => (!set.has(i.id) ? [i] : change.deleted_at ? [] : [{ ...i, ...change }])),
      () => updateShoppingItems(ids, change),
    );
  }

  /** Aggiunge ciò che è stato scritto; se l'articolo è già in lista da comprare non lo duplica. */
  function add(input: string | Entry) {
    const entry = typeof input === "string" ? parseEntry(input) : input;
    if (!entry.name) return Promise.resolve(false);
    const name = normalizeName(entry.name);
    if (qc.getQueryData<ShoppingItem[]>(ITEMS_KEY)?.some((i) => !i.checked && normalizeName(i.name) === name)) {
      toast({ message: `${entry.name} è già in lista` });
      return Promise.resolve(true);
    }
    const memory = qc.getQueryData<ProductMemory[]>(MEMORY_KEY) ?? [];
    const item: ShoppingItem = {
      id: uuidv7(),
      list_id: listId.current ?? "",
      ...entry,
      department: learnedDepartment(entry.name, memory),
      checked: false,
      checked_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    return apply(
      (items) => [...items, item],
      async () => {
        listId.current ??= await shoppingListId();
        await insertShoppingItem({ ...item, list_id: listId.current });
      },
    );
  }

  function toggle(item: ShoppingItem) {
    return patch([item.id], item.checked ? { checked: false, checked_at: null } : { checked: true, checked_at: new Date().toISOString() });
  }

  async function remove(items: ShoppingItem[], message: string) {
    const ids = items.map((i) => i.id);
    const ok = await patch(ids, { deleted_at: new Date().toISOString() });
    if (!ok) return;
    toast({
      message,
      actionLabel: "Annulla",
      onAction: () =>
        apply(
          (current) => [...current, ...items],
          () => updateShoppingItems(ids, { deleted_at: null }),
        ),
    });
  }

  return {
    add,
    toggle,
    edit: (item: ShoppingItem, change: Pick<ShoppingItem, "name" | "quantity" | "department">) => patch([item.id], change),
    remove: (item: ShoppingItem) => remove([item], "Articolo eliminato"),
    clearChecked: (checked: ShoppingItem[]) =>
      remove(checked, checked.length === 1 ? "1 articolo tolto dalla lista" : `${checked.length} articoli tolti dalla lista`),
  };
}
