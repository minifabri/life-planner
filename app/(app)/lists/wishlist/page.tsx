"use client";

import { useState } from "react";
import { ImportSheet } from "@/components/wishlist/import-sheet";
import { ItemSheet, type ItemSave } from "@/components/wishlist/item-sheet";
import { Button, Segmented } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useOffline } from "@/lib/data/hooks";
import { addWishToWardrobe } from "@/lib/data/wardrobe";
import { useWardrobeItems } from "@/lib/data/wardrobe-hooks";
import { createWishlistItems, importRows, updateWishlistItem } from "@/lib/data/wishlist";
import { useFetchPendingMetadata, useWishlistItems } from "@/lib/data/wishlist-hooks";
import { INTEREST_LABEL, STATUS_LABEL, categoriesOf, missingFromLink, siteName, visibleItems } from "@/lib/wishlist/list";
import { formatPrice } from "@/lib/wishlist/price";
import type { WishlistItem, WishlistStatus } from "@/lib/supabase/types";

const STATUSES = (["wanted", "bought", "discarded"] as const).map((value) => ({ value, label: STATUS_LABEL[value] }));

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

export default function WishlistPage() {
  const toast = useToast();
  const offline = useOffline();
  const query = useWishlistItems();
  useFetchPendingMetadata();

  const [status, setStatus] = useState<WishlistStatus>("wanted");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishlistItem | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const items = query.data ?? [];
  const wardrobe = useWardrobeItems().data;
  const categories = categoriesOf(items, status);
  const activeCategory = category && categories.includes(category) ? category : null;
  const visible = visibleItems(items, status, activeCategory);
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

  return (
    <>
      <PageHeader eyebrow="Liste" title="Wishlist" />

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEditing("new")} tour="wishlist-add">
          Aggiungi
        </Button>
        <Button onClick={() => setImporting(true)} tour="wishlist-import">Incolla da testo</Button>
      </div>

      <Segmented label="Stato" value={status} options={STATUSES} onChange={setStatus} tour="wishlist-filters" />

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
      ) : visible.length === 0 ? (
        <EmptyState
          title={status === "wanted" ? (activeCategory ? "Niente in questa categoria." : "La wishlist è vuota.") : status === "bought" ? "Ancora nessun acquisto." : "Nessun articolo scartato."}
          hint="Aggiungi un articolo a mano, incolla un link o i consigli di ChatGPT."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((item) => (
            <ItemCard key={item.id} item={item} onOpen={() => setEditing(item)} onBought={item.status === "wanted" ? () => void markBought(item) : undefined} />
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
              setStatus("wanted");
              toast({ message: rows.length === 1 ? "1 articolo aggiunto" : `${rows.length} articoli aggiunti` });
            }
            return ok;
          }}
        />
      ) : null}
    </>
  );
}

/** Card essenziale: immagine se c'è, nome, marca, prezzo se c'è, interesse. Sui desiderati, la spunta sposta in Acquistati. */
function ItemCard({ item, onOpen, onBought }: { item: WishlistItem; onOpen: () => void; onBought?: () => void }) {
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
          {waiting ? (
            <span className="text-xs text-text-3">Dati del link da recuperare</span>
          ) : missingData.length ? (
            <span className="text-xs text-text-3">Dal link non {missingData.length === 1 ? "è arrivato" : "sono arrivati"}: {missingData.join(", ")}</span>
          ) : null}
        </span>
      </button>
      {onBought ? (
        <button
          type="button"
          onClick={onBought}
          aria-label={`Segna come acquistato: ${item.name}`}
          title="Acquistato"
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
