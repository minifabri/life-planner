"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { uuidv7 } from "../ids";
import { normalizeName, parseEntry, type Entry } from "../shopping/entry";
import { learnedDepartment } from "../shopping/list";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import {
  fetchPantryItems,
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
const PANTRY_KEY = ["pantry-items"];

export function useShoppingItems() {
  const qc = useQueryClient();
  // La lettura restituisce i dati del server con sopra le modifiche in attesa: ricaricare non le cancella.
  useEffect(
    () =>
      subscribeToShoppingItems(() => {
        qc.invalidateQueries({ queryKey: ITEMS_KEY });
        qc.invalidateQueries({ queryKey: MEMORY_KEY });
        qc.invalidateQueries({ queryKey: PANTRY_KEY });
      }),
    [qc],
  );
  return useQuery({ queryKey: ITEMS_KEY, queryFn: fetchShoppingItems });
}

/** In casa (Pasti): ciò che è stato comprato e non è ancora finito. */
export function usePantryItems() {
  return useQuery({ queryKey: PANTRY_KEY, queryFn: fetchPantryItems });
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

/** Azioni sulla lista: l'interfaccia si aggiorna subito, l'invio al server segue appena c'è rete. */
export function useShoppingActions() {
  const qc = useQueryClient();
  const toast = useToast();

  async function apply(write: () => Promise<void>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch {
      // La outbox non è scrivibile oppure la lista non è mai stata scaricata su questo dispositivo.
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
      return false;
    }
  }

  const patch = (items: ShoppingItem[], change: ShoppingPatch) => apply(() => updateShoppingItems(items, change));

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
    const item: Omit<ShoppingItem, "list_id"> = {
      id: uuidv7(),
      ...entry,
      department: learnedDepartment(entry.name, memory),
      checked: false,
      checked_at: null,
      finished_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    return apply(async () => insertShoppingItem({ ...item, list_id: await shoppingListId() }));
  }

  function toggle(item: ShoppingItem) {
    return patch([item], item.checked ? { checked: false, checked_at: null } : { checked: true, checked_at: new Date().toISOString() });
  }

  async function remove(items: ShoppingItem[], message: string) {
    const ok = await patch(items, { deleted_at: new Date().toISOString() });
    if (!ok) return;
    toast({
      message,
      actionLabel: "Annulla",
      onAction: () => patch(items, { deleted_at: null }),
    });
  }

  /** Finito: l'ingrediente esce da "In casa" (tutti gli acquisti di quel prodotto), con annulla. */
  async function finish(name: string, items: ShoppingItem[]) {
    const ok = await patch(items, { finished_at: new Date().toISOString() });
    if (!ok) return;
    toast({ message: `${name}: finito`, actionLabel: "Annulla", onAction: () => patch(items, { finished_at: null }) });
  }

  return {
    add,
    toggle,
    finish,
    edit: (item: ShoppingItem, change: Pick<ShoppingItem, "name" | "quantity" | "department">) => patch([item], change),
    remove: (item: ShoppingItem) => remove([item], "Articolo eliminato"),
    clearChecked: (checked: ShoppingItem[]) =>
      remove(checked, checked.length === 1 ? "1 articolo tolto dalla lista" : `${checked.length} articoli tolti dalla lista`),
  };
}
