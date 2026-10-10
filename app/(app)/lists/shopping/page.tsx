"use client";

import { useRef, useState } from "react";
import { ItemEditor } from "@/components/shopping/item-editor";
import { ItemRow } from "@/components/shopping/item-row";
import { Button, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useNow } from "@/lib/data/hooks";
import { useProductMemory, useShoppingActions, useShoppingItems } from "@/lib/data/shopping-hooks";
import { parseEntry } from "@/lib/shopping/entry";
import { groupItems, recentProducts, suggestProducts } from "@/lib/shopping/list";
import type { ProductMemory } from "@/lib/supabase/types";

export default function ShoppingPage() {
  const itemsQuery = useShoppingItems();
  const memory = useProductMemory().data ?? [];
  const actions = useShoppingActions();
  const now = useNow();

  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const items = itemsQuery.data ?? [];
  const { groups, checked } = groupItems(items);
  const toBuy = groups.reduce((n, g) => n + g.items.length, 0);
  const editing = items.find((i) => i.id === editingId);

  const entry = parseEntry(text);
  const suggestions = suggestProducts(entry.name, memory, items, now);
  const recent = text.trim() ? [] : recentProducts(memory, items);

  function add(product?: ProductMemory) {
    const next = product ? { name: product.display_name, quantity: entry.quantity } : entry;
    if (!next.name) return;
    setText("");
    input.current?.focus();
    void actions.add(next);
  }

  return (
    <>
      <PageHeader eyebrow="Liste" title="Spesa" muted={toBuy > 0 ? String(toBuy) : undefined} />

      <div className="flex flex-col gap-1.5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor="shopping-add" className="sr-only">
            Aggiungi un articolo
          </label>
          <input
            id="shopping-add"
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Aggiungi un articolo"
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="done"
            className={inputClass}
          />
          <Button type="submit" variant="primary" disabled={!entry.name} className="shrink-0">
            Aggiungi
          </Button>
        </form>

        {suggestions.length > 0 ? (
          <ul aria-label="Suggerimenti" className="flex flex-col rounded-xl border border-line bg-surface px-3">
            {suggestions.map((p) => (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => add(p)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]">
                  <span className="min-w-0 break-words">{p.display_name}</span>
                  {p.department ? <span className="shrink-0 text-xs text-text-3">{p.department}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {itemsQuery.isError && itemsQuery.data === undefined ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>Non riesco a caricare la lista. Controlla la connessione.</p>
          <button type="button" onClick={() => itemsQuery.refetch()} className="min-h-11 rounded-lg px-3 font-medium text-accent">
            Riprova
          </button>
        </div>
      ) : itemsQuery.data === undefined ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico la lista…
        </p>
      ) : items.length === 0 ? (
        <EmptyState title="La lista è vuota." hint="Scrivi cosa ti serve: anche “2 latte” o “500 g farina”." />
      ) : null}

      {groups.map((group) => (
        <section key={group.department} aria-label={group.department} className="flex flex-col gap-1">
          <h2 className="label-mono">{group.department}</h2>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={() => actions.toggle(item)} onEdit={() => setEditingId(item.id)} />
            ))}
          </ul>
        </section>
      ))}

      {checked.length > 0 ? (
        <section aria-label="Presi" className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="label-mono">Presi · {checked.length}</h2>
            <button
              type="button"
              onClick={() => actions.clearChecked(checked)}
              className="-mr-2.5 min-h-11 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
            >
              Svuota completati
            </button>
          </div>
          <ul className="flex flex-col">
            {checked.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={() => actions.toggle(item)} onEdit={() => setEditingId(item.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section aria-label="Acquistati di recente" className="flex flex-col gap-2">
          <h2 className="label-mono">Acquistati di recente</h2>
          <ul className="flex flex-wrap gap-1.5">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  aria-label={`Aggiungi ${p.display_name}`}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line-2 pl-2.5 pr-3 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <Icon name="plus" size={14} />
                  {p.display_name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <ItemEditor
          key={editing.id}
          item={editing}
          onSave={(change) => actions.edit(editing, change)}
          onDelete={() => actions.remove(editing)}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );
}
