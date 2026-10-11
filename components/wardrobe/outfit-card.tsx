"use client";

import { Icon } from "@/components/ui/icon";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { relativeDay, type LocalDate } from "@/lib/dates/local";
import { resolveItems, toWashCount, wearsOf } from "@/lib/wardrobe/outfits";
import type { Outfit, WardrobeItem, WardrobeWear } from "@/lib/supabase/types";

const BOARD_SLOTS = 4;

/** Un outfit nell'elenco: moodboard delle foto dei capi (le stesse del catalogo, nessuna copia). */
export function OutfitCard({ outfit, items, wears, today, onOpen }: { outfit: Outfit; items: WardrobeItem[]; wears: WardrobeWear[]; today: LocalDate; onOpen: () => void }) {
  const resolved = resolveItems(outfit.item_ids, items);
  const shown = resolved.items.slice(0, BOARD_SLOTS);
  const extra = resolved.items.length - shown.length;
  const toWash = toWashCount(resolved.items);
  const last = wearsOf(wears, outfit.id)[0];
  const name = outfit.name ?? "Outfit senza nome";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Apri: ${name}`}
        className="flex w-full flex-col gap-2 rounded-2xl border border-line bg-surface p-1.5 text-left transition-transform duration-200 ease-out-soft active:scale-[0.97]"
      >
        <span className="relative grid aspect-square w-full grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-[10px]">
          {shown.map((item, index) => (
            <span key={item.id} className={`relative overflow-hidden rounded-lg bg-surface-2 ${shown.length === 1 ? "col-span-2 row-span-2" : shown.length === 2 ? "row-span-2" : shown.length === 3 && index === 0 ? "row-span-2" : ""}`}>
              <WardrobePhoto item={item} />
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-scrim text-sm text-text">+{extra}</span>
              ) : null}
            </span>
          ))}
          {shown.length === 0 ? <span className="col-span-2 row-span-2 flex items-center justify-center rounded-lg bg-surface-2 text-xs text-text-3">Nessun capo</span> : null}
          {outfit.favorite ? (
            <span aria-hidden className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-surface/90 text-accent">
              <Icon name="heart" size={12} />
            </span>
          ) : null}
          {toWash > 0 ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-full border border-line-2 bg-surface/90 px-1.5 py-0.5 text-[10px] text-text-2">
              {toWash === 1 ? "1 capo da lavare" : `${toWash} capi da lavare`}
            </span>
          ) : null}
        </span>
        <span className="flex flex-col gap-0.5 px-0.5 pb-0.5">
          <span className="line-clamp-1 text-[13px] text-text">{name}</span>
          <span className="line-clamp-1 text-[11px] text-text-3">{last ? `Indossato ${relativeDay(last.worn_on, today)}` : "Mai indossato"}</span>
        </span>
      </button>
    </li>
  );
}
