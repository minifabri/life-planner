"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/ui/page-header";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { relativeDay, shortDate, type LocalDate } from "@/lib/dates/local";
import { CATEGORY_LABEL } from "@/lib/wardrobe/categories";
import { timesLabel, wardrobeStats, type Usage } from "@/lib/wardrobe/stats";
import type { Outfit, WardrobeItem, WardrobeWear } from "@/lib/supabase/types";

const SHOWN = 8;

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] border border-line px-3 py-2.5">
      <span className="text-[22px] font-light leading-none tracking-[-0.02em]">{value}</span>
      <span className="text-xs text-text-2">{label}</span>
    </div>
  );
}

function ItemRow({ item, detail, onOpen }: { item: WardrobeItem; detail: string; onOpen: () => void }) {
  const name = item.name ?? CATEGORY_LABEL[item.category];
  return (
    <li>
      <button type="button" onClick={onOpen} aria-label={`Apri: ${name}`} className="-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-surface-2">
        <span className="size-11 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
          <WardrobePhoto item={item} />
        </span>
        <span className="line-clamp-1 min-w-0 flex-1 text-sm">{name}</span>
        <span className="shrink-0 text-xs text-text-2">{detail}</span>
      </button>
    </li>
  );
}

function Block({ title, hint, extra, children }: { title: string; hint?: string; extra?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="label-mono">{title}</h2>
      {hint ? <p className="text-xs text-text-3">{hint}</p> : null}
      <ul className="flex flex-col">{children}</ul>
      {extra && extra > 0 ? <p className="text-xs text-text-3">e altri {extra}</p> : null}
    </section>
  );
}

function usageDetail(usage: Usage, today: LocalDate): string {
  return usage.last ? `${timesLabel(usage.count)} · ${relativeDay(usage.last, today)}` : "mai";
}

/** Statistiche essenziali del guardaroba, ricavate dallo storico degli utilizzi. Niente grafici. */
export function StatsView({
  items,
  outfits,
  wears,
  today,
  onOpenItem,
  onOpenOutfit,
}: {
  items: WardrobeItem[];
  outfits: Outfit[];
  wears: WardrobeWear[];
  today: LocalDate;
  onOpenItem: (item: WardrobeItem) => void;
  onOpenOutfit: (outfit: Outfit) => void;
}) {
  const stats = useMemo(() => wardrobeStats(items, outfits, wears, today), [items, outfits, wears, today]);

  if (stats.items === 0) return <EmptyState title="Ancora nessun numero." hint="Aggiungi qualche capo e segna cosa indossi: qui trovi cosa usi di più e cosa resta fermo." />;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Figure value={String(stats.items)} label={stats.items === 1 ? "capo" : "capi"} />
        <Figure value={String(stats.outfits)} label="outfit" />
        <Figure value={`${stats.wornRecently} su ${stats.items}`} label="indossati in 30 giorni" />
      </div>

      {stats.since ? (
        <p className="text-xs text-text-3">Contano gli utilizzi registrati dal {shortDate(stats.since)}.</p>
      ) : (
        <p className="text-sm text-text-2">Non hai ancora registrato utilizzi: segna &quot;Indossato oggi&quot; su un outfit o sui capi per vedere cosa usi di più.</p>
      )}

      {stats.mostWorn.length > 0 ? (
        <Block title="I più indossati">
          {stats.mostWorn.map(({ item, usage }) => (
            <ItemRow key={item.id} item={item} detail={usageDetail(usage, today)} onOpen={() => onOpenItem(item)} />
          ))}
        </Block>
      ) : null}

      {stats.topOutfits.length > 0 ? (
        <Block title="Outfit più indossati">
          {stats.topOutfits.map(({ outfit, usage }) => (
            <li key={outfit.id}>
              <button
                type="button"
                onClick={() => onOpenOutfit(outfit)}
                className="-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center justify-between gap-3 rounded-xl px-2 py-1 text-left hover:bg-surface-2"
              >
                <span className="line-clamp-1 text-sm">{outfit.name ?? "Outfit senza nome"}</span>
                <span className="shrink-0 text-xs text-text-2">{usageDetail(usage, today)}</span>
              </button>
            </li>
          ))}
        </Block>
      ) : null}

      {stats.since && stats.neverWorn.length > 0 ? (
        <Block title="Mai indossati" extra={stats.neverWorn.length - SHOWN}>
          {stats.neverWorn.slice(0, SHOWN).map((item) => (
            <ItemRow key={item.id} item={item} detail={CATEGORY_LABEL[item.category]} onOpen={() => onOpenItem(item)} />
          ))}
        </Block>
      ) : null}

      {stats.forgotten.length > 0 ? (
        <Block title="Fermi da più di due mesi" extra={stats.forgotten.length - SHOWN}>
          {stats.forgotten.slice(0, SHOWN).map(({ item, usage }) => (
            <ItemRow key={item.id} item={item} detail={usage.last ? shortDate(usage.last) : ""} onOpen={() => onOpenItem(item)} />
          ))}
        </Block>
      ) : null}

      {stats.unpaired.length > 0 ? (
        <Block title="Mai abbinati" hint="Non sono in nessun outfit salvato né sono stati indossati con altri capi. Apri un capo e prova &quot;Abbina&quot;." extra={stats.unpaired.length - SHOWN}>
          {stats.unpaired.slice(0, SHOWN).map((item) => (
            <ItemRow key={item.id} item={item} detail={CATEGORY_LABEL[item.category]} onOpen={() => onOpenItem(item)} />
          ))}
        </Block>
      ) : null}
    </>
  );
}
