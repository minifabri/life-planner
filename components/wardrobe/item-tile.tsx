"use client";

import { WardrobePhoto } from "@/components/wardrobe/photo";
import { Icon } from "@/components/ui/icon";
import { STATUS_LABEL } from "@/lib/wardrobe/categories";
import type { WardrobeItem } from "@/lib/supabase/types";

export function WardrobeTile({
  item,
  selected,
  selecting,
  onOpen,
  onToggleSelect,
}: {
  item: WardrobeItem;
  selected: boolean;
  selecting: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <li className="rounded-2xl">
      <button
        type="button"
        onClick={selecting ? onToggleSelect : onOpen}
        aria-label={`${selecting ? (selected ? "Deseleziona" : "Seleziona") : "Apri"}: ${item.name ?? "capo senza nome"}`}
        aria-pressed={selecting ? selected : undefined}
        className="flex aspect-square w-full flex-col gap-1.5 rounded-2xl border border-line bg-surface p-1.5 text-left transition-transform duration-200 ease-out-soft active:scale-[0.97]"
      >
        <span
          className={`relative flex-1 overflow-hidden rounded-[10px] bg-surface-2 ${
            selecting && selected ? "outline outline-2 -outline-offset-2 outline-accent" : ""
          }`}
        >
          <WardrobePhoto item={item} />
          {selecting ? (
            <span
              aria-hidden
              className={`absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border ${
                selected ? "border-accent bg-accent-fill text-on-accent" : "border-line-2 bg-surface/90"
              }`}
            >
              {selected ? <Icon name="check" size={12} strokeWidth={2.2} /> : null}
            </span>
          ) : item.favorite ? (
            <span aria-hidden className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-surface/90 text-accent">
              <Icon name="heart" size={12} />
            </span>
          ) : null}
          {item.status !== "clean" ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-full border border-line-2 bg-surface/90 px-1.5 py-0.5 text-[10px] text-text-2">
              {STATUS_LABEL[item.status]}
            </span>
          ) : null}
        </span>
        <span className="line-clamp-1 px-0.5 text-[12px] text-text">{item.name ?? "Senza nome"}</span>
      </button>
    </li>
  );
}
