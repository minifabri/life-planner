"use client";

import { useState } from "react";
import { ImportSheet } from "@/components/wishlist/import-sheet";
import { ItemSheet, type ItemSave } from "@/components/wishlist/item-sheet";
import { Button, Segmented } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { answerArrival, markReturned } from "@/lib/data/shipments";
import { addWishToWardrobe } from "@/lib/data/wardrobe";
import { useWardrobeItems } from "@/lib/data/wardrobe-hooks";
import { createWishlistItems, importRows, updateWishlistItem } from "@/lib/data/wishlist";
import { useFetchPendingMetadata, useWishlistItems } from "@/lib/data/wishlist-hooks";
import { INTEREST_LABEL, STATUS_LABEL, categoriesOf, missingFromLink, siteName, visibleItems } from "@/lib/wishlist/list";
import { formatPrice } from "@/lib/wishlist/price";
import { RETURN_DAYS, awaitingDecision, returnItems, type ShipmentAnswer } from "@/lib/wishlist/shipments";
import { addDays, dueLabel, relativeDay, shortDate, type LocalDate } from "@/lib/dates/local";
import type { WishlistItem } from "@/lib/supabase/types";

/** Schede di Acquisti: tre stati e i resi (da restituire e restituiti insieme). */
type Tab = "wanted" | "bought" | "returns" | "discarded";
const TABS: { value: Tab; label: string }[] = [
  { value: "wanted", label: "Wishlist" },
  { value: "bought", label: STATUS_LABEL.bought },
  { value: "returns", label: "Resi" },
  { value: "discarded", label: STATUS_LABEL.discarded },
];

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

export default function WishlistPage() {
  const toast = useToast();
  const offline = useOffline();
  const query = useWishlistItems();
  useFetchPendingMetadata();

  const tz = useTimezone();
  const { today } = useToday(tz);
  const [tab, setTab] = useState<Tab>("wanted");
  const status = tab === "returns" ? null : tab;
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishlistItem | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const items = query.data ?? [];
  const wardrobe = useWardrobeItems().data;
  const categories = status ? categoriesOf(items, status) : [];
  const activeCategory = category && categories.includes(category) ? category : null;
  const visible = status ? visibleItems(items, status, activeCategory) : [];
  const toDecide = awaitingDecision(items);
  const returns = returnItems(items);
  const allCategories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "it"));
  const missing = query.data === undefined;
  const failed = missing && (offline || query.isError);

  async function attempt(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch {
      return false;
    }
  }

  async function save(input: ItemSave): Promise<boolean> {
    const target = editing;
    const ok = await attempt(() =>
      target && target !== "new"
        ? updateWishlistItem(target, input)
        : createWishlistItems([{ ...input, source: input.url ? "link" : "manual" }]),
    );
    if (ok) setEditing(null);
    return ok;
  }

  /** Salva l'articolo acquistato e ne fa un capo del guardaroba, con i dati che ha già. */
  async function addToWardrobe(input: ItemSave): Promise<boolean> {
    const target = editing;
    if (!target || target === "new") return false;
    if (!(await attempt(() => updateWishlistItem(target, input)))) return false;
    if (!(await attempt(() => addWishToWardrobe({ ...target, ...input })))) return false;
    setEditing(null);
    toast({ message: "Aggiunto al guardaroba. La foto puoi cambiarla lì." });
    return true;
  }

  async function remove(item: WishlistItem) {
    setEditing(null);
    if (!(await attempt(() => updateWishlistItem(item, { deleted_at: new Date().toISOString() })))) {
      toast({ message: "Non eliminato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Articolo eliminato", actionLabel: "Annulla", onAction: () => void attempt(() => updateWishlistItem(item, { deleted_at: null })) });
  }

  async function markBought(item: WishlistItem) {
    if (!(await attempt(() => updateWishlistItem(item, { status: "bought" })))) {
      toast({ message: "Non spostato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Spostato in Acquistati", actionLabel: "Annulla", onAction: () => void attempt(() => updateWishlistItem(item, { status: item.status })) });
  }

  /** Decisione su un pacco arrivato e rimandato ("Ci penso più tardi"). */
  async function decide(item: WishlistItem, choice: Exclude<ShipmentAnswer, "later">) {
    let undo: () => Promise<void>;
    try {
      undo = await answerArrival({ item, name: item.name, eventId: item.shipment_event_id, day: item.arrived_on }, choice, today);
    } catch {
      toast({ message: "Non salvato. Riprova.", tone: "warn" });
      return;
    }
    toast({
      message: choice === "keep" ? "Spostato in Acquistati" : `Restituzione in Oggi, ${dueLabel(addDays(today, RETURN_DAYS), today)}`,
      actionLabel: "Annulla",
      onAction: () => void undo().catch(() => {}),
    });
  }

  async function returned(item: WishlistItem) {
    let undo: () => Promise<void>;
    try {
      undo = await markReturned(item);
    } catch {
      toast({ message: "Non salvato. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Restituito", actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
  }

  return (
    <>
      <PageHeader eyebrow="Liste" title="Acquisti" />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEditing("new")} tour="wishlist-add">
          Aggiungi
        </Button>
        <Button onClick={() => setImporting(true)} tour="wishlist-import">Incolla da testo</Button>
      </div>

      {toDecide.length > 0 ? (
        <section aria-label="Arrivati, da decidere" className="flex flex-col gap-2">
          <h2 className="label-mono">Arrivati, da decidere</h2>
          <ul className="flex flex-col gap-2">
            {toDecide.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                <p className="text-sm">
                  «{item.name}»{item.arrived_on ? <span className="text-text-2"> · arrivato {arrivedLabel(item.arrived_on, today)}</span> : null}. Va tutto bene?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void decide(item, "keep")}>Sì, lo tengo</Button>
                  <Button onClick={() => void decide(item, "return")}>Da restituire</Button>
                  <Button variant="quiet" onClick={() => setEditing(item)}>
                    Apri
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Segmented label="Stato" value={tab} options={TABS} onChange={setTab} tour="wishlist-filters" />

      {categories.length > 0 ? (
        <div role="group" aria-label="Categoria" data-tour="wishlist-filters" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          <button type="button" aria-pressed={!activeCategory} onClick={() => setCategory(null)} className={chip(!activeCategory)}>
            Tutte
          </button>
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={activeCategory === c} onClick={() => setCategory(activeCategory === c ? null : c)} className={chip(activeCategory === c)}>
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "La wishlist non è ancora stata scaricata su questo dispositivo: serve la connessione." : "Non riesco a caricare la wishlist. Controlla la connessione."}</p>
          <button type="button" onClick={() => query.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
            Riprova
          </button>
        </div>
      ) : missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico la wishlist…
        </p>
      ) : tab === "returns" ? (
        returns.returning.length === 0 && returns.returned.length === 0 ? (
          <EmptyState title="Nessun reso." hint="Quando un pacco arriva, Oggi ti chiede se va bene: da lì puoi segnarlo da restituire." />
        ) : (
          <>
            {returns.returning.length > 0 ? (
              <section aria-label="Da restituire" className="flex flex-col gap-2">
                <h2 className="label-mono">Da restituire</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {returns.returning.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onOpen={() => setEditing(item)}
                      detail={item.return_by ? returnLabel(item.return_by, today) : undefined}
                      action={{ label: `Segna come restituito: ${item.name}`, title: "Restituito", onClick: () => void returned(item) }}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {returns.returned.length > 0 ? (
              <section aria-label="Restituiti" className="flex flex-col gap-2">
                <h2 className="label-mono">Restituiti</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {returns.returned.map((item) => (
                    <ItemCard key={item.id} item={item} onOpen={() => setEditing(item)} detail={item.arrived_on ? `Arrivato il ${shortDate(item.arrived_on)}` : undefined} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )
      ) : visible.length === 0 ? (
        <EmptyState
          title={status === "wanted" ? (activeCategory ? "Niente in questa categoria." : "La wishlist è vuota.") : status === "bought" ? "Ancora nessun acquisto." : "Nessun articolo scartato."}
          hint={status === "bought" ? "Quando un pacco arriva, Oggi ti chiede se va bene e lo sposta qui." : "Aggiungi un articolo a mano, incolla un link o i consigli di ChatGPT."}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onOpen={() => setEditing(item)}
              detail={item.status === "bought" && item.arrived_on ? `Arrivato il ${shortDate(item.arrived_on)}` : undefined}
              action={item.status === "wanted" ? { label: `Segna come acquistato: ${item.name}`, title: "Acquistato", onClick: () => void markBought(item) } : undefined}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <ItemSheet
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          categories={allCategories}
          offline={offline}
          onSave={save}
          onDelete={() => {
            if (editing !== "new") void remove(editing);
          }}
          inWardrobe={editing !== "new" && !!wardrobe?.some((w) => w.wishlist_item_id === editing.id)}
          onAddToWardrobe={addToWardrobe}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {importing ? (
        <ImportSheet
          onClose={() => setImporting(false)}
          onImport={async (rows) => {
            const ok = await attempt(() => importRows(rows));
            if (ok) {
              setImporting(false);
              setTab("wanted");
              toast({ message: rows.length === 1 ? "1 articolo aggiunto" : `${rows.length} articoli aggiunti` });
            }
            return ok;
          }}
        />
      ) : null}
    </>
  );
}

/** "ieri", "lunedì", "il 12 ott". */
function arrivedLabel(day: LocalDate, today: LocalDate): string {
  const rel = relativeDay(day, today);
  return /^\d/.test(rel) ? `il ${rel}` : rel;
}

/** Scadenza di un reso: "Da restituire entro venerdì", oppure "Scaduto il 2 nov". */
function returnLabel(by: LocalDate, today: LocalDate): string {
  return by < today ? `Da restituire: scaduto il ${shortDate(by)}` : `Da restituire ${dueLabel(by, today)}`;
}

/**
 * Card essenziale: immagine se c'è, nome, marca, prezzo se c'è, interesse.
 * `action` è la spunta a destra: sui desiderati sposta in Acquistati, sui resi segna come restituito.
 */
function ItemCard({
  item,
  onOpen,
  action,
  detail,
}: {
  item: WishlistItem;
  onOpen: () => void;
  action?: { label: string; title: string; onClick: () => void };
  detail?: string;
}) {
  const price = formatPrice(item.price_amount, item.price_currency, item.price_is_estimate);
  const site = item.url ? siteName(item.url) : null;
  const missingData = missingFromLink(item);
  const waiting = !!item.url && !item.metadata_fetched_at && item.source === "link";
  return (
    <li className="flex overflow-hidden rounded-[14px] border border-line bg-surface">
      <button type="button" onClick={onOpen} aria-label={`Apri: ${item.name}`} className="flex min-h-[88px] min-w-0 flex-1 gap-3 p-3 text-left hover:bg-surface-2">
        {item.image_url ? (
          // Immagine esterna del negozio: nessuna copia nell'app, e il sito non sa da dove arriva la richiesta.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-[10px] bg-surface-2 object-cover" />
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="break-words text-[15px] leading-snug">{item.name}</span>
          <span className="text-xs text-text-3">{[item.brand, item.category].filter(Boolean).join(" · ")}</span>
          <span className="mt-auto flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-text-2">{price ?? ""}</span>
            <span className="flex items-center gap-[3px]" role="img" aria-label={`Interesse: ${INTEREST_LABEL[item.interest].toLowerCase()}`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={`size-1.5 rounded-full ${n <= item.interest ? "bg-accent" : "border border-line-2"}`} />
              ))}
            </span>
          </span>
          {detail ? <span className="text-xs text-text-2">{detail}</span> : null}
          {waiting ? (
            <span className="text-xs text-text-3">Dati del link da recuperare</span>
          ) : missingData.length ? (
            <span className="text-xs text-text-3">Dal link non {missingData.length === 1 ? "è arrivato" : "sono arrivati"}: {missingData.join(", ")}</span>
          ) : null}
        </span>
      </button>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.title}
          className="flex w-11 shrink-0 items-center justify-center border-l border-line text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <Icon name="check" size={16} />
        </button>
      ) : null}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apri il link di ${item.name}${site ? ` su ${site}` : ""} in una nuova scheda`}
          className="flex w-11 shrink-0 items-center justify-center border-l border-line text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <Icon name="chevronRight" size={16} />
        </a>
      ) : null}
    </li>
  );
}
