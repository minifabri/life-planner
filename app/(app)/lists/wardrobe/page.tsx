"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { IdeasView } from "@/components/wardrobe/ideas-view";
import { UpcomingDays } from "@/components/days/day-signs";
import { ItemSheet, type ItemSave } from "@/components/wardrobe/item-sheet";
import { LaundryPanel } from "@/components/wardrobe/laundry-panel";
import { OffSeasonToggle } from "@/components/wardrobe/off-season";
import { OutfitCard } from "@/components/wardrobe/outfit-card";
import { OutfitSheet } from "@/components/wardrobe/outfit-sheet";
import { PlanList } from "@/components/wardrobe/plan-list";
import { PlanSheet, type PlanChoice } from "@/components/wardrobe/plan-sheet";
import { StatsView } from "@/components/wardrobe/stats-view";
import { StyleSheet } from "@/components/wardrobe/style-sheet";
import { WearSheet } from "@/components/wardrobe/wear-sheet";
import { WardrobeTile } from "@/components/wardrobe/item-tile";
import { Button, Segmented, inputClass } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { relativeDay } from "@/lib/dates/local";
import { STYLE_KEY, createOutfit, createPlan, deletePlan, recordWear, restorePlan, saveWardrobeStyle, setFeedback, undoWear, updateOutfit, updatePlan, type OutfitInput, type WearChoice } from "@/lib/data/outfits";
import { attachWardrobePhoto, createWardrobeItem, duplicateWardrobeItem, purgeDeletedWardrobePhotos, updateWardrobeItem } from "@/lib/data/wardrobe";
import { useForecast } from "@/lib/data/weather";
import { useOutfitFeedback, useOutfitPlans, useOutfits, useWardrobeItems, useWardrobeStyle, useWears } from "@/lib/data/wardrobe-hooks";
import { CATEGORY_LABEL, SEASON_LABEL, STATUS_LABEL } from "@/lib/wardrobe/categories";
import { WASH_GROUP_LABEL, washGroupOf } from "@/lib/wardrobe/laundry";
import { distinctValues, filterWardrobe, type WardrobeFilters } from "@/lib/wardrobe/list";
import { filterOutfits, resolveItems } from "@/lib/wardrobe/outfits";
import { resolvePlan, upcomingPlans, type ResolvedPlan } from "@/lib/wardrobe/plans";
import { splitBySeason } from "@/lib/wardrobe/season";
import { itemUsage, timesLabel } from "@/lib/wardrobe/stats";
import { DEFAULT_STYLE, type Suggestion } from "@/lib/wardrobe/suggest";
import type { Outfit, OutfitFeedback, OutfitPlan, WardrobeItem, WardrobeStyle, WashGroup } from "@/lib/supabase/types";
import { cityName, forecastFor } from "@/lib/weather/forecast";

type View = "items" | "outfits" | "ideas" | "stats";
/** L'outfit aperto nel foglio: uno esistente, oppure uno nuovo che parte da questi capi. */
type OutfitEditor = { outfit: Outfit | null; itemIds: string[] };
/** Capi di cui si sta registrando l'utilizzo, con l'outfit da cui vengono (se c'è). */
type Wearing = { outfitId: string | null; items: WardrobeItem[] };
/** Ciò che si sta pianificando: una pianificazione esistente da spostare, oppure un outfit o dei capi sciolti. */
type Planning = { plan: OutfitPlan | null; outfitId: string | null; itemIds: string[] };

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] transition-colors capitalize ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

const ITEM_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4";

function toggleIn(list: string[] | undefined, value: string): string[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function FilterRow({
  title,
  options,
  labels,
  value,
  onToggle,
}: {
  title: string;
  options: string[];
  labels?: Record<string, string>;
  value: string[];
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div role="group" aria-label={title} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => onToggle(o)} className={chip(value.includes(o))}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export default function WardrobePage() {
  const toast = useToast();
  const offline = useOffline();
  const query = useWardrobeItems();
  const items = query.data ?? [];
  const outfitsQuery = useOutfits();
  const outfits = outfitsQuery.data ?? [];
  const wearsQuery = useWears();
  const feedbackQuery = useOutfitFeedback();
  const style = useWardrobeStyle().data ?? DEFAULT_STYLE;
  const queryClient = useQueryClient();
  const wears = useMemo(() => wearsQuery.data ?? [], [wearsQuery.data]);
  const suggestData = useMemo(
    () => ({ items: query.data ?? [], outfits: outfitsQuery.data ?? [], wears, feedback: feedbackQuery.data ?? [], style }),
    [query.data, outfitsQuery.data, wears, feedbackQuery.data, style],
  );
  const { today } = useToday(useTimezone());
  const weather = useForecast();

  const [view, setView] = useState<View>("items");
  const [outfitEditor, setOutfitEditor] = useState<OutfitEditor | null>(null);
  const [wearing, setWearing] = useState<Wearing | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [editingStyle, setEditingStyle] = useState(false);

  const [filters, setFilters] = useState<WardrobeFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [showOffSeason, setShowOffSeason] = useState(false);
  const [editing, setEditing] = useState<WardrobeItem | "new" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = filterWardrobe(items, filters);
  // Prima i capi di stagione, gli altri a un tocco. Se cerchi o scegli tu la stagione, si vede tutto insieme.
  const bySeason = filters.text || filters.seasons?.length ? { current: visible, other: [] } : splitBySeason(visible, today);
  const offSeasonOpen = showOffSeason || bySeason.current.length === 0;
  const tile = (item: WardrobeItem) => (
    <WardrobeTile
      key={item.id}
      item={item}
      selecting={selecting}
      selected={selected.has(item.id)}
      onOpen={() => setEditing(item)}
      onToggleSelect={() => toggleSelected(item.id)}
    />
  );
  const visibleOutfits = filterOutfits(outfits, filters.text ?? "");
  const activeQuery = view === "outfits" ? outfitsQuery : query;
  const anchor = items.find((i) => i.id === anchorId) ?? null;
  const plans = upcomingPlans(useOutfitPlans().data ?? [], today).map((p) => resolvePlan(p, outfits, items));
  const missing = activeQuery.data === undefined;
  const failed = missing && (offline || activeQuery.isError);

  // Le foto dei capi eliminati da tempo non servono più: si tolgono dallo Storage quando c'è rete.
  useEffect(() => {
    if (!offline) void purgeDeletedWardrobePhotos().catch(() => {});
  }, [offline]);

  const categories = distinctValues(items, (i) => [i.category]);
  const statuses = distinctValues(items, (i) => [i.status]);
  const colors = distinctValues(items, (i) => i.colors);
  const seasons = distinctValues(items, (i) => i.seasons);
  const styles = distinctValues(items, (i) => i.styles);
  const occasions = distinctValues(items, (i) => i.occasions);
  const washGroups = distinctValues(items, (i) => [washGroupOf(i) ?? "none"]);
  // Il gruppo scelto da "Da lavare": filtra i capi da lavare di quel gruppo.
  const laundryGroup = filters.washGroups?.length === 1 && filters.statuses?.length === 1 && filters.statuses[0] === "to_wash" ? (filters.washGroups[0] as WashGroup | "none") : null;

  async function attempt(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch {
      return false;
    }
  }

  async function save(input: ItemSave): Promise<boolean> {
    const { photo, ...fields } = input;
    const target = editing;
    let id: string;
    try {
      if (target && target !== "new") {
        await updateWardrobeItem(target, fields);
        id = target.id;
      } else {
        id = await createWardrobeItem(fields);
      }
    } catch {
      return false;
    }
    setEditing(null);
    if (photo) {
      try {
        await attachWardrobePhoto(id, photo);
      } catch {
        toast({ message: "Capo salvato. Per la foto serve la connessione.", tone: "warn" });
      }
    }
    return true;
  }

  async function remove(item: WardrobeItem) {
    setEditing(null);
    if (!(await attempt(() => updateWardrobeItem(item, { deleted_at: new Date().toISOString() })))) {
      toast({ message: "Non eliminato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Capo eliminato", actionLabel: "Annulla", onAction: () => void attempt(() => updateWardrobeItem(item, { deleted_at: null })) });
  }

  async function duplicate(item: WardrobeItem) {
    setEditing(null);
    if (!(await attempt(() => duplicateWardrobeItem(item)))) {
      toast({ message: "Non duplicato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Capo duplicato" });
  }

  async function saveOutfit(input: OutfitInput): Promise<boolean> {
    const target = outfitEditor?.outfit;
    if (!(await attempt(() => (target ? updateOutfit(target, input) : createOutfit(input))))) return false;
    setOutfitEditor(null);
    return true;
  }

  /** Salva l'outfit aperto e passa a chiedere come restano i capi. */
  async function wearOutfit(input: OutfitInput): Promise<boolean> {
    const target = outfitEditor?.outfit;
    if (!target) return false;
    if (!(await attempt(() => updateOutfit(target, input)))) return false;
    setOutfitEditor(null);
    setWearing({ outfitId: target.id, items: resolveItems(input.item_ids, items).items });
    return true;
  }

  /** Salva l'outfit aperto e passa a scegliere il giorno. */
  async function planOutfit(input: OutfitInput): Promise<boolean> {
    const target = outfitEditor?.outfit;
    if (!target) return false;
    if (!(await attempt(() => updateOutfit(target, input)))) return false;
    setOutfitEditor(null);
    setPlanning({ plan: null, outfitId: target.id, itemIds: input.item_ids });
    return true;
  }

  async function savePlan(choice: PlanChoice): Promise<boolean> {
    const target = planning;
    if (!target) return false;
    const write = target.plan
      ? () => updatePlan(target.plan!, choice)
      : () => createPlan({ ...choice, outfit_id: target.outfitId, item_ids: target.itemIds });
    if (!(await attempt(write))) return false;
    setPlanning(null);
    toast({ message: target.plan ? "Pianificazione aggiornata" : "Outfit pianificato" });
    return true;
  }

  async function removePlan(resolved: ResolvedPlan) {
    if (!(await attempt(() => deletePlan(resolved.plan)))) {
      toast({ message: "Non tolto. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Pianificazione tolta", actionLabel: "Annulla", onAction: () => void attempt(() => restorePlan(resolved.plan)) });
  }

  async function removeOutfit(outfit: Outfit) {
    setOutfitEditor(null);
    if (!(await attempt(() => updateOutfit(outfit, { deleted_at: new Date().toISOString() })))) {
      toast({ message: "Non eliminato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Outfit eliminato", actionLabel: "Annulla", onAction: () => void attempt(() => updateOutfit(outfit, { deleted_at: null })) });
  }

  async function confirmWear(choices: WearChoice[]): Promise<boolean> {
    const target = wearing;
    if (!target) return false;
    let wearId: string;
    try {
      wearId = await recordWear(target.outfitId, today, choices);
    } catch {
      return false;
    }
    setWearing(null);
    toast({ message: "Utilizzo registrato", actionLabel: "Annulla", onAction: () => void attempt(() => undoWear(wearId, choices)) });
    return true;
  }

  async function giveFeedback(suggestion: Suggestion, verdict: OutfitFeedback["verdict"] | null) {
    const existing = (feedbackQuery.data ?? []).find((f) => f.signature === suggestion.signature) ?? null;
    if (!(await attempt(() => setFeedback(existing, suggestion.itemIds, verdict)))) {
      toast({ message: "Non registrato. Riprova.", tone: "warn" });
      return;
    }
    if (verdict !== "dislike") return;
    toast({
      message: "Non te lo ripropongo",
      actionLabel: "Annulla",
      onAction: () => {
        const given = (queryClient.getQueryData<OutfitFeedback[]>(["outfit-feedback"]) ?? []).find((f) => f.signature === suggestion.signature) ?? null;
        void attempt(() => setFeedback(given, suggestion.itemIds, existing?.verdict ?? null));
      },
    });
  }

  async function saveStyle(next: WardrobeStyle): Promise<boolean> {
    if (!(await attempt(() => saveWardrobeStyle(next)))) return false;
    queryClient.setQueryData(STYLE_KEY, next);
    setEditingStyle(false);
    return true;
  }

  function usageText(itemId: string): string {
    const usage = itemUsage(wears).get(itemId);
    return usage?.last ? `Indossato ${timesLabel(usage.count)} · ultima volta ${relativeDay(usage.last, today)}` : "Mai indossato.";
  }

  function endSelection(): WardrobeItem[] {
    const ids = [...selected];
    setSelecting(false);
    setSelected(new Set());
    return items.filter((i) => ids.includes(i.id));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkSetStatus(status: WardrobeItem["status"]) {
    const targets = endSelection();
    const ok = (await Promise.all(targets.map((i) => attempt(() => updateWardrobeItem(i, { status }))))).every(Boolean);
    toast(ok ? { message: `${targets.length} capi aggiornati` } : { message: "Alcuni capi non sono stati aggiornati. Riprova.", tone: "warn" });
  }

  return (
    <>
      <PageHeader
        eyebrow="Liste"
        title="Guardaroba"
        actions={
          view === "items" ? (
            <Button variant="quiet" onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>
              {selecting ? "Fatto" : "Seleziona"}
            </Button>
          ) : undefined
        }
      />

      {/* Com'è fatta la settimana (ufficio, viaggio, allenamento): aiuta a scegliere cosa mettere. */}
      <UpcomingDays today={today} tour="wardrobe-week" />

      <Segmented
        label="Vista"
        value={view}
        options={[
          { value: "items", label: "Capi", tour: "wardrobe-pieces" },
          { value: "outfits", label: "Outfit", tour: "wardrobe-pieces" },
          { value: "ideas", label: "Idee", tour: "wardrobe-ideas" },
          { value: "stats", label: "Numeri", tour: "wardrobe-stats" },
        ]}
        onChange={(v) => {
          setView(v);
          setSelecting(false);
          setSelected(new Set());
        }}
      />

      {view === "ideas" || view === "stats" ? null : (
        <div className="flex flex-wrap gap-2">
          {view === "items" ? (
            <>
              <Button variant="primary" onClick={() => setEditing("new")}>
                Aggiungi
              </Button>
              <Button onClick={() => setShowFilters((v) => !v)}>{showFilters ? "Nascondi filtri" : "Filtri"}</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setOutfitEditor({ outfit: null, itemIds: [] })}>
              Nuovo outfit
            </Button>
          )}
          <input
            type="search"
            aria-label={view === "items" ? "Cerca tra i capi" : "Cerca tra gli outfit"}
            placeholder="Cerca"
            value={filters.text ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value || undefined }))}
            autoComplete="off"
            className={`${inputClass} min-w-0 flex-1 basis-40`}
          />
        </div>
      )}

      {view === "outfits" ? (
        <PlanList
          plans={plans}
          today={today}
          days={weather.days}
          onWear={(p) => setWearing({ outfitId: p.outfit?.id ?? null, items: p.items })}
          onChange={(p) => setPlanning({ plan: p.plan, outfitId: p.plan.outfit_id, itemIds: p.itemIds })}
          onRemove={(p) => void removePlan(p)}
        />
      ) : null}

      {view === "items" ? (
        <>
          <LaundryPanel
            today={today}
            activeGroup={laundryGroup}
            onGroup={(g) => setFilters((f) => ({ ...f, washGroups: g ? [g] : undefined, statuses: g ? ["to_wash"] : undefined }))}
          />

          <FilterRow title="Categoria" options={categories} labels={CATEGORY_LABEL} value={filters.categories ?? []} onToggle={(v) => setFilters((f) => ({ ...f, categories: toggleIn(f.categories, v) }))} />

          {showFilters ? (
            <div className="flex flex-col gap-3 rounded-[14px] border border-line p-3">
              <FilterRow title="Stato" options={statuses} labels={STATUS_LABEL} value={filters.statuses ?? []} onToggle={(v) => setFilters((f) => ({ ...f, statuses: toggleIn(f.statuses, v) }))} />
              <FilterRow title="Lavaggio" options={washGroups} labels={{ ...WASH_GROUP_LABEL, none: "Senza gruppo" }} value={filters.washGroups ?? []} onToggle={(v) => setFilters((f) => ({ ...f, washGroups: toggleIn(f.washGroups, v) }))} />
              <FilterRow title="Colore" options={colors} value={filters.colors ?? []} onToggle={(v) => setFilters((f) => ({ ...f, colors: toggleIn(f.colors, v) }))} />
              <FilterRow title="Stagione" options={seasons} labels={SEASON_LABEL} value={filters.seasons ?? []} onToggle={(v) => setFilters((f) => ({ ...f, seasons: toggleIn(f.seasons, v) }))} />
              <FilterRow title="Stile" options={styles} value={filters.styles ?? []} onToggle={(v) => setFilters((f) => ({ ...f, styles: toggleIn(f.styles, v) }))} />
              <FilterRow title="Occasione" options={occasions} value={filters.occasions ?? []} onToggle={(v) => setFilters((f) => ({ ...f, occasions: toggleIn(f.occasions, v) }))} />
              <label className="flex min-h-9 w-fit cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={!!filters.favoriteOnly} onChange={(e) => setFilters((f) => ({ ...f, favoriteOnly: e.target.checked }))} className="size-5 accent-[var(--accent-fill)]" />
                Solo preferiti
              </label>
              {Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : !!v)) ? (
                <Button variant="quiet" className="self-start" onClick={() => setFilters({})}>
                  Azzera filtri
                </Button>
              ) : null}
            </div>
          ) : null}

          {selecting && selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line-2 bg-surface-2 px-3 py-2 text-sm">
              <span>{selected.size} selezionati</span>
              <Button
                onClick={() => {
                  const targets = endSelection();
                  setView("outfits");
                  setOutfitEditor({ outfit: null, itemIds: targets.map((i) => i.id) });
                }}
              >
                Crea outfit
              </Button>
              <Button onClick={() => setWearing({ outfitId: null, items: endSelection() })}>Indossati oggi</Button>
              <Button onClick={() => void bulkSetStatus("to_wash")}>Da lavare</Button>
              <Button onClick={() => void bulkSetStatus("clean")}>Pulito</Button>
            </div>
          ) : null}

          {failed ? (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
              <p>{offline ? "Il guardaroba non è ancora stato scaricato su questo dispositivo: serve la connessione." : "Non riesco a caricare il guardaroba. Controlla la connessione."}</p>
              <button type="button" onClick={() => query.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
                Riprova
              </button>
            </div>
          ) : missing ? (
            <p className="text-sm text-text-3" aria-live="polite">
              Carico il guardaroba…
            </p>
          ) : visible.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? "Il guardaroba è vuoto." : "Nessun capo con questi filtri."}
              hint="Aggiungi un capo con una foto, o solo con nome e categoria: il resto si completa dopo."
            />
          ) : (
            <>
              {bySeason.current.length > 0 ? <ul className={ITEM_GRID}>{bySeason.current.map(tile)}</ul> : null}
              {bySeason.other.length > 0 && bySeason.current.length > 0 ? (
                <OffSeasonToggle count={bySeason.other.length} open={offSeasonOpen} controls="wardrobe-off-season" onToggle={() => setShowOffSeason(!offSeasonOpen)} />
              ) : null}
              {offSeasonOpen && bySeason.other.length > 0 ? (
                <ul id="wardrobe-off-season" aria-label="Fuori stagione" className={ITEM_GRID}>
                  {bySeason.other.map(tile)}
                </ul>
              ) : null}
            </>
          )}
        </>
      ) : view === "stats" ? (
        missing ? (
          <p className="text-sm text-text-3" aria-live="polite">
            Carico il guardaroba…
          </p>
        ) : (
          <StatsView items={items} outfits={outfits} wears={wears} today={today} onOpenItem={setEditing} onOpenOutfit={(outfit) => setOutfitEditor({ outfit, itemIds: outfit.item_ids })} />
        )
      ) : view === "ideas" ? (
        missing ? (
          <p className="text-sm text-text-3" aria-live="polite">
            Carico il guardaroba…
          </p>
        ) : (
          <IdeasView
            data={suggestData}
            today={today}
            city={weather.place ? cityName(weather.place) : null}
            forecast={forecastFor(weather.days, today)}
            anchor={anchor}
            onClearAnchor={() => setAnchorId(null)}
            onFeedback={(s, v) => void giveFeedback(s, v)}
            onSave={(s) => setOutfitEditor({ outfit: null, itemIds: s.itemIds })}
            onPlan={(s) => setPlanning({ plan: null, outfitId: null, itemIds: s.itemIds })}
            onWear={(s) => setWearing({ outfitId: null, items: s.items })}
            onEditStyle={() => setEditingStyle(true)}
          />
        )
      ) : failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "Gli outfit non sono ancora stati scaricati su questo dispositivo: serve la connessione." : "Non riesco a caricare gli outfit. Controlla la connessione."}</p>
          <button type="button" onClick={() => outfitsQuery.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
            Riprova
          </button>
        </div>
      ) : missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico gli outfit…
        </p>
      ) : visibleOutfits.length === 0 ? (
        <EmptyState
          title={outfits.length === 0 ? "Nessun outfit salvato." : "Nessun outfit con questa ricerca."}
          hint="Componi un outfit scegliendo i capi dal guardaroba: bastano anche due."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {visibleOutfits.map((outfit) => (
            <OutfitCard key={outfit.id} outfit={outfit} items={items} wears={wears} today={today} onOpen={() => setOutfitEditor({ outfit, itemIds: outfit.item_ids })} />
          ))}
        </ul>
      )}

      {outfitEditor ? (
        <OutfitSheet
          key={outfitEditor.outfit?.id ?? "new"}
          outfit={outfitEditor.outfit}
          initialItemIds={outfitEditor.itemIds}
          items={items}
          wears={wears}
          today={today}
          onSave={saveOutfit}
          onWear={wearOutfit}
          onPlan={planOutfit}
          onDelete={() => {
            if (outfitEditor.outfit) void removeOutfit(outfitEditor.outfit);
          }}
          onClose={() => setOutfitEditor(null)}
        />
      ) : null}

      {planning ? (
        <PlanSheet
          key={planning.plan?.id ?? "new"}
          items={resolveItems(planning.itemIds, items).items}
          today={today}
          weather={weather}
          initial={planning.plan}
          onSave={savePlan}
          onClose={() => setPlanning(null)}
        />
      ) : null}

      {editingStyle ? <StyleSheet style={style} onSave={saveStyle} onClose={() => setEditingStyle(false)} /> : null}

      {wearing ? <WearSheet items={wearing.items} onConfirm={confirmWear} onClose={() => setWearing(null)} /> : null}

      {editing ? (
        <ItemSheet
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onSave={save}
          onDelete={() => {
            if (editing !== "new") void remove(editing);
          }}
          onDuplicate={editing !== "new" ? () => void duplicate(editing) : undefined}
          usage={editing !== "new" ? usageText(editing.id) : undefined}
          onMatch={
            editing !== "new"
              ? () => {
                  setAnchorId(editing.id);
                  setEditing(null);
                  setView("ideas");
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
