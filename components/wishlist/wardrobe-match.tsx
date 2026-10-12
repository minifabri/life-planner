"use client";

import { WardrobePhoto } from "@/components/wardrobe/photo";
import { useOutfits, useWardrobeItems } from "@/lib/data/wardrobe-hooks";
import { CATEGORY_LABEL } from "@/lib/wardrobe/categories";
import { compatibility } from "@/lib/wardrobe/wishlist";
import type { WardrobeCategory, WardrobeItem } from "@/lib/supabase/types";

function Row({ title, items }: { title: string; items: WardrobeItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-2">{title}</span>
      <ul className="flex gap-1.5 overflow-x-auto">
        {items.map((item) => (
          <li key={item.id} className="flex w-14 shrink-0 flex-col gap-1">
            <span className="size-14 overflow-hidden rounded-[10px] bg-surface-2">
              <WardrobePhoto item={item} />
            </span>
            <span className="line-clamp-1 text-[10px] text-text-3">{item.name ?? CATEGORY_LABEL[item.category]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Confronto tra l'articolo che si sta guardando e il guardaroba: solo ciò che i dati permettono di dire. */
export function WardrobeMatch({ garment, colors, styles }: { garment: WardrobeCategory | null; colors: string[]; styles: string[] }) {
  const items = useWardrobeItems().data;
  const outfits = useOutfits().data;
  if (!items || !outfits) return null;
  const result = compatibility({ garment, colors, styles }, items, outfits);
  const nothing = result.similar.length + result.matches.length + result.completes.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line p-3">
      <span className="label-mono">Nel guardaroba</span>
      {result.hints.map((hint) => (
        <p key={hint} className="text-sm text-text-2">
          {hint}
        </p>
      ))}
      {nothing && result.hints.length === 0 ? <p className="text-sm text-text-2">Niente di simile e nessun abbinamento evidente con i capi che hanno i colori indicati.</p> : null}
      <Row title="Hai già qualcosa di simile" items={result.similar} />
      <Row title="Si abbinerebbe con" items={result.matches} />
      {result.completes.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-2">Completerebbe questi outfit</span>
          <p className="text-sm">{result.completes.map((o) => o.name ?? "Outfit senza nome").join(" · ")}</p>
        </div>
      ) : null}
    </div>
  );
}
