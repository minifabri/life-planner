"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import type { OutfitInput } from "@/lib/data/outfits";
import { relativeDay, type LocalDate } from "@/lib/dates/local";
import { CATEGORY_LABEL, OCCASION_OPTIONS, SEASONS, SEASON_LABEL, STATUS_LABEL, STYLE_OPTIONS } from "@/lib/wardrobe/categories";
import { distinctValues } from "@/lib/wardrobe/list";
import { replaceItem, resolveItems, suggestOutfitTags, toggleItem, wearsOf } from "@/lib/wardrobe/outfits";
import type { Outfit, WardrobeItem, WardrobeWear } from "@/lib/supabase/types";

type Tags = Pick<Outfit, "styles" | "occasions" | "seasons">;
type Picking = { mode: "add" } | { mode: "replace"; id: string };

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

const chip = (active: boolean) =>
  `flex min-h-9 shrink-0 items-center rounded-lg border px-2.5 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

function ChipGroup({ label, options, labels, value, onChange }: { label: string; options: string[]; labels?: Record<string, string>; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-2">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => onChange(toggle(value, o))} className={`${chip(value.includes(o))} ${labels ? "" : "capitalize"}`}>
            {labels?.[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardTile({ item, label, pressed, onClick }: { item: WardrobeItem; label: string; pressed?: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="flex w-full flex-col gap-1 rounded-2xl border border-line bg-surface p-1.5 text-left transition-transform duration-200 ease-out-soft active:scale-[0.97]"
      >
        <span className={`relative aspect-square w-full overflow-hidden rounded-[10px] bg-surface-2 ${pressed ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}>
          <WardrobePhoto item={item} />
          {pressed ? (
            <span aria-hidden className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border border-accent bg-accent-fill text-on-accent">
              <Icon name="check" size={12} strokeWidth={2.2} />
            </span>
          ) : null}
          {item.status !== "clean" ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-full border border-line-2 bg-surface/90 px-1.5 py-0.5 text-[10px] text-text-2">{STATUS_LABEL[item.status]}</span>
          ) : null}
        </span>
        <span className="line-clamp-1 px-0.5 text-[12px] text-text">{item.name ?? CATEGORY_LABEL[item.category]}</span>
      </button>
    </li>
  );
}

/** Nuovo outfit o modifica: una moodboard dei capi scelti; tocca un capo per sostituirlo o toglierlo. */
export function OutfitSheet({
  outfit,
  initialItemIds,
  items,
  wears,
  today,
  onSave,
  onWear,
  onDelete,
  onClose,
}: {
  outfit: Outfit | null;
  initialItemIds: string[];
  items: WardrobeItem[];
  wears: WardrobeWear[];
  today: LocalDate;
  onSave: (input: OutfitInput) => Promise<boolean>;
  /** Salva le modifiche e passa a registrare l'utilizzo. */
  onWear: (input: OutfitInput) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [itemIds, setItemIds] = useState<string[]>(outfit?.item_ids ?? initialItemIds);
  const [name, setName] = useState(outfit?.name ?? "");
  const [manualTags, setManualTags] = useState<Tags | null>(outfit ? { styles: outfit.styles, occasions: outfit.occasions, seasons: outfit.seasons } : null);
  const [favorite, setFavorite] = useState(outfit?.favorite ?? false);
  const [notes, setNotes] = useState(outfit?.notes ?? "");
  const [showMore, setShowMore] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(!outfit && initialItemIds.length === 0 ? { mode: "add" } : null);
  const [pickCategory, setPickCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = resolveItems(itemIds, items);
  // Finché non le tocchi, le etichette seguono i capi scelti.
  const tags = manualTags ?? suggestOutfitTags(resolved.items);
  const history = outfit ? wearsOf(wears, outfit.id) : [];

  function setTag(key: keyof Tags, value: string[]) {
    setManualTags({ ...tags, [key]: value });
  }

  function input(): OutfitInput {
    return { name: name.trim() || null, item_ids: itemIds, ...tags, favorite, notes: notes.trim() || null };
  }

  async function run(action: (input: OutfitInput) => Promise<boolean>) {
    setBusy(true);
    setError(null);
    if (!(await action(input()))) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  function openPicker(next: Picking) {
    const replaced = next.mode === "replace" ? items.find((i) => i.id === next.id) : null;
    setPickCategory(replaced?.category ?? null);
    setPicking(next);
  }

  function pick(id: string) {
    if (picking?.mode === "replace") {
      setItemIds((ids) => replaceItem(ids, picking.id, id));
      setPicking(null);
    } else {
      setItemIds((ids) => toggleItem(ids, id));
    }
  }

  if (picking) {
    const replaced = picking.mode === "replace" ? items.find((i) => i.id === picking.id) : null;
    const categories = distinctValues(items, (i) => [i.category]);
    const candidates = items.filter((i) => !pickCategory || i.category === pickCategory).filter((i) => i.id !== replaced?.id);
    return (
      <Sheet title={replaced ? "Sostituisci capo" : "Scegli i capi"} isOpen onClose={onClose}>
        <div className="flex flex-col gap-4">
          {replaced ? (
            <div className="flex items-center justify-between gap-3">
              <span className="line-clamp-1 text-sm text-text-2">Al posto di: {replaced.name ?? CATEGORY_LABEL[replaced.category]}</span>
              <Button
                variant="quiet"
                className="-mr-4 shrink-0"
                onClick={() => {
                  setItemIds((ids) => ids.filter((id) => id !== replaced.id));
                  setPicking(null);
                }}
              >
                Togli dall&apos;outfit
              </Button>
            </div>
          ) : null}
          <div role="group" aria-label="Categoria" className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
            <button type="button" aria-pressed={!pickCategory} onClick={() => setPickCategory(null)} className={chip(!pickCategory)}>
              Tutti
            </button>
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={pickCategory === c} onClick={() => setPickCategory(c)} className={chip(pickCategory === c)}>
                {CATEGORY_LABEL[c as WardrobeItem["category"]]}
              </button>
            ))}
          </div>
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-3">{items.length === 0 ? "Il guardaroba è vuoto: aggiungi prima qualche capo." : "Nessun capo in questa categoria."}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {candidates.map((item) => {
                const included = itemIds.includes(item.id);
                const label = item.name ?? CATEGORY_LABEL[item.category];
                return (
                  <BoardTile
                    key={item.id}
                    item={item}
                    label={picking.mode === "replace" ? `Usa: ${label}` : `${included ? "Togli" : "Aggiungi"}: ${label}`}
                    pressed={picking.mode === "add" ? included : undefined}
                    onClick={() => pick(item.id)}
                  />
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-2">{itemIds.length === 1 ? "1 capo" : `${itemIds.length} capi`}</span>
            <Button variant={picking.mode === "add" ? "primary" : "secondary"} onClick={() => setPicking(null)}>
              {picking.mode === "add" ? "Fatto" : "Annulla"}
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={outfit ? "Outfit" : "Nuovo outfit"} isOpen onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(onSave);
        }}
        className="flex flex-col gap-4"
      >
        <ul className="grid grid-cols-3 gap-2">
          {resolved.items.map((item) => (
            <BoardTile key={item.id} item={item} label={`Sostituisci o togli: ${item.name ?? CATEGORY_LABEL[item.category]}`} onClick={() => openPicker({ mode: "replace", id: item.id })} />
          ))}
          <li>
            <button
              type="button"
              onClick={() => openPicker({ mode: "add" })}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-2 text-[12px] text-text-2 hover:text-text"
            >
              <Icon name="plus" size={18} />
              Aggiungi capi
            </button>
          </li>
        </ul>

        {resolved.missing > 0 ? (
          <p className="text-xs text-text-3">{resolved.missing === 1 ? "Un capo di questo outfit non è più nel guardaroba." : `${resolved.missing} capi di questo outfit non sono più nel guardaroba.`}</p>
        ) : null}

        <Field label="Nome (facoltativo)" htmlFor="outfit-name">
          <input id="outfit-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Es. Cena fuori" className={inputClass} />
        </Field>

        <button type="button" onClick={() => setShowMore((v) => !v)} className="-mx-1 flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-sm text-accent">
          {showMore ? "Nascondi altri dettagli" : "Altri dettagli"}
          <Icon name={showMore ? "chevronLeft" : "chevronRight"} size={14} className={showMore ? "-rotate-90" : "rotate-90"} />
        </button>

        {showMore ? (
          <div className="flex flex-col gap-4">
            {!manualTags && resolved.items.length > 0 ? <p className="text-xs text-text-3">Stili, occasioni e stagioni sono proposti dai capi scelti: correggili come vuoi.</p> : null}
            <ChipGroup label="Stili" options={STYLE_OPTIONS} value={tags.styles} onChange={(v) => setTag("styles", v)} />
            <ChipGroup label="Occasioni" options={OCCASION_OPTIONS} value={tags.occasions} onChange={(v) => setTag("occasions", v)} />
            <ChipGroup label="Stagioni" options={SEASONS} labels={SEASON_LABEL} value={tags.seasons} onChange={(v) => setTag("seasons", v)} />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
              Preferito
            </label>
            <Field label="Note" htmlFor="outfit-notes">
              <textarea id="outfit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} py-2.5`} />
            </Field>
          </div>
        ) : null}

        {outfit ? (
          <p className="text-xs text-text-3">
            {history.length === 0
              ? "Mai indossato."
              : `Indossato ${history.length === 1 ? "una volta" : `${history.length} volte`} · ultima volta ${relativeDay(history[0].worn_on, today)}`}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {outfit ? (
            <Button variant="quiet" className="-ml-4" onClick={onDelete} disabled={busy}>
              Elimina
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {outfit ? (
              <Button onClick={() => void run(onWear)} disabled={busy || resolved.items.length === 0}>
                Indossato oggi
              </Button>
            ) : null}
            <Button type="submit" variant="primary" disabled={busy || itemIds.length === 0}>
              Salva
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
