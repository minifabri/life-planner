"use client";

import { useRef, useState } from "react";
import { ItemEditor } from "@/components/shopping/item-editor";
import { ItemTile } from "@/components/shopping/item-tile";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { useProductMemory, useShoppingActions, useShoppingItems } from "@/lib/data/shopping-hooks";
import { parseEntry } from "@/lib/shopping/entry";
import { departmentOf, frequentProducts, groupItems, recentProducts, suggestProducts, usageLabel } from "@/lib/shopping/list";
import { MONTH_NAME, monthOf, seasonalPicks } from "@/lib/shopping/seasonal";
import type { ProductMemory } from "@/lib/supabase/types";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2";

export default function ShoppingPage() {
  const itemsQuery = useShoppingItems();
  const memory = useProductMemory().data ?? [];
  const actions = useShoppingActions();
  const { today, now } = useToday(useTimezone());

  const [text, setText] = useState("");
  // Suggerimento evidenziato con le frecce; -1 = nessuno, Invio aggiunge ciò che è scritto.
  const [active, setActive] = useState(-1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const items = itemsQuery.data ?? [];
  const { groups, checked } = groupItems(items);
  const toBuy = groups.reduce((n, g) => n + g.items.length, 0);
  const editing = items.find((i) => i.id === editingId);

  const entry = parseEntry(text);
  const suggestions = suggestProducts(entry.name, memory, items, now);
  const typing = text.trim() !== "";
  const frequent = typing ? [] : frequentProducts(memory, items, now);
  const recent = typing ? [] : recentProducts(memory, items).filter((p) => !frequent.includes(p));
  // Di stagione: un suggerimento in più, in fondo e sottovoce. Niente di ciò che è già in lista o già proposto sopra.
  const shown = new Set([...frequent, ...recent].map((p) => p.display_name));
  const seasonal = typing ? [] : seasonalPicks(today, memory, items, now).filter((p) => !shown.has(p.name)).slice(0, 10);
  const typedDepartment = entry.name ? departmentOf(entry.name, null) : null;

  function write(value: string) {
    setText(value);
    setActive(-1);
  }

  function add(product?: ProductMemory | { display_name: string }) {
    const next = product ? { name: product.display_name, quantity: entry.quantity } : entry;
    if (!next.name) return;
    write("");
    input.current?.focus();
    void actions.add(next);
  }

  return (
    <>
      <PageHeader eyebrow="Liste" title="Spesa" muted={toBuy > 0 ? String(toBuy) : undefined} />

      <div className="relative z-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(suggestions[active]);
          }}
          style={departmentStyle(typedDepartment)}
          className="flex min-h-[52px] items-center gap-2.5 rounded-[14px] border border-line bg-surface pl-3.5 pr-1 focus-within:border-line-2"
        >
          <span className={`flex shrink-0 ${typedDepartment ? "text-(--dept)" : "text-text-3"}`}>
            {typedDepartment ? <ProductIcon name={entry.name} department={null} size={20} /> : <Icon name="plus" size={20} />}
          </span>
          <label htmlFor="shopping-add" className="sr-only">
            Aggiungi un articolo
          </label>
          <input
            id="shopping-add"
            ref={input}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="shopping-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `shopping-suggestion-${active}` : undefined}
            value={text}
            onChange={(e) => write(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") write("");
              if (!suggestions.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              // Da -1 (nessuno) si entra dal primo o dall'ultimo, e si torna a -1 dopo un giro.
              setActive(((active + 1 + step + suggestions.length + 1) % (suggestions.length + 1)) - 1);
            }}
            placeholder="Aggiungi… prova “2 latte d’avena”"
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="done"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-3 md:text-[15px]"
          />
          <Button type="submit" variant="primary" disabled={!entry.name} className="shrink-0">
            Aggiungi
          </Button>
        </form>

        {suggestions.length > 0 ? (
          <ul
            id="shopping-suggestions"
            role="listbox"
            aria-label="Suggerimenti"
            className="rise absolute inset-x-0 top-[58px] rounded-[14px] border border-line-2 bg-surface py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)]"
          >
            {suggestions.map((p, i) => (
              <li key={p.id} role="presentation" style={departmentStyle(departmentOf(p.display_name, p.department))}>
                <button
                  type="button"
                  id={`shopping-suggestion-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onClick={() => add(p)}
                  className={`flex min-h-[46px] w-full items-center gap-3 px-3.5 text-left text-[15px] hover:bg-surface-2 ${i === active ? "bg-surface-2" : ""}`}
                >
                  <span className="flex shrink-0 text-(--dept)">
                    <ProductIcon name={p.display_name} department={p.department} size={20} />
                  </span>
                  <span className="min-w-0 flex-1 break-words">{p.display_name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-text-3">{usageLabel(p, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {frequent.length > 0 ? (
        <section aria-label="Compri spesso" className="flex flex-col gap-2">
          <h2 className="label-mono">Compri spesso</h2>
          <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-10 md:px-10">
            {frequent.map((p) => (
              <li key={p.id} className="shrink-0" style={departmentStyle(departmentOf(p.display_name, p.department))}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  aria-label={`Aggiungi ${p.display_name}`}
                  className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-line-2 pl-3 pr-3.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <span className="flex text-(--dept)">
                    <ProductIcon name={p.display_name} department={p.department} size={16} />
                  </span>
                  {p.display_name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        <EmptyState title="La lista è vuota." hint="Scrivi cosa ti serve: anche “2 latte d’avena” o “500 g farina”. Il reparto lo trovo io." />
      ) : null}

      {groups.map((group) => (
        <section key={group.department} aria-label={group.department} className="flex flex-col gap-2" style={departmentStyle(group.department)}>
          <h2 className="label-mono flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-(--dept)" />
            {group.department}
            <span className="font-normal">· {group.items.length}</span>
          </h2>
          <ul className={GRID}>
            {group.items.map((item) => (
              <ItemTile key={item.id} item={item} onToggle={() => actions.toggle(item)} onEdit={() => setEditingId(item.id)} />
            ))}
          </ul>
        </section>
      ))}

      {checked.length > 0 ? (
        <section aria-label="Nel carrello" className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="label-mono">Nel carrello · {checked.length}</h2>
            <button
              type="button"
              onClick={() => actions.clearChecked(checked)}
              className="-mr-2.5 min-h-11 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
            >
              Svuota completati
            </button>
          </div>
          <ul className={GRID}>
            {checked.map((item) => (
              <ItemTile key={item.id} item={item} onToggle={() => actions.toggle(item)} onEdit={() => setEditingId(item.id)} />
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

      {seasonal.length > 0 ? (
        <section aria-label="Di stagione" className="flex flex-col gap-1.5">
          <h2 className="label-mono">Di stagione a {MONTH_NAME[monthOf(today) - 1]}</h2>
          <ul className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:-mx-10 md:flex-wrap md:px-10">
            {seasonal.map((p) => (
              <li key={p.produce.name} className="shrink-0">
                <button
                  type="button"
                  onClick={() => add({ display_name: p.name })}
                  aria-label={`Aggiungi ${p.name}`}
                  className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line pl-2.5 pr-3 text-[13px] text-text-3 hover:bg-surface-2 hover:text-text"
                >
                  <Icon name="plus" size={12} />
                  {p.name}
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
