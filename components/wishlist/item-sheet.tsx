"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { fetchLinkMetadata, type WishlistInput } from "@/lib/data/wishlist";
import { INTEREST_LABEL, STATUS_LABEL, metadataPatch } from "@/lib/wishlist/list";
import { failureMessage } from "@/lib/wishlist/metadata";
import { parseAmount } from "@/lib/wishlist/price";
import type { WishlistItem, WishlistStatus } from "@/lib/supabase/types";

const INTERESTS = ([1, 2, 3] as const).map((value) => ({ value: String(value) as "1" | "2" | "3", label: INTEREST_LABEL[value] }));
const STATUSES = (["wanted", "bought", "discarded"] as const).map((value) => ({ value, label: STATUS_LABEL[value] }));

export type ItemSave = WishlistInput & { status: WishlistStatus; metadata_fetched_at: string | null };

/** Nuovo articolo o modifica: tutto si può scrivere a mano; con un link si possono recuperare i dati della pagina. */
export function ItemSheet({
  item,
  categories,
  offline,
  onSave,
  onDelete,
  onClose,
}: {
  item: WishlistItem | null;
  categories: string[];
  offline: boolean;
  onSave: (input: ItemSave) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [price, setPrice] = useState(item?.price_amount !== null && item?.price_amount !== undefined ? String(item.price_amount).replace(".", ",") : "");
  const [currency, setCurrency] = useState(item?.price_currency ?? "EUR");
  const [estimate, setEstimate] = useState(item?.price_is_estimate ?? false);
  const [image, setImage] = useState(item?.image_url ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [interest, setInterest] = useState<"1" | "2" | "3">(String(item?.interest ?? 2) as "1" | "2" | "3");
  const [status, setStatus] = useState<WishlistStatus>(item?.status ?? "wanted");
  const [fetchedAt, setFetchedAt] = useState(item?.metadata_fetched_at ?? null);
  const [fetchedHere, setFetchedHere] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = url.trim();
  const validLink = /^https?:\/\/\S+\.\S+/i.test(link);

  async function recover() {
    setFetching(true);
    setLinkNote(null);
    try {
      const reply = await fetchLinkMetadata(link);
      setFetchedAt(new Date().toISOString());
      setFetchedHere(true);
      if (!reply.ok) {
        setLinkNote(failureMessage(reply.reason));
        return;
      }
      const amount = price.trim() ? parseAmount(price) : null;
      const patch = metadataPatch(
        { name, url: link, brand: brand || null, image_url: image || null, price_amount: amount, price_currency: currency, price_is_estimate: estimate },
        reply.metadata,
      );
      if (patch.name) setName(patch.name);
      if (patch.brand) setBrand(patch.brand);
      if (patch.image_url) setImage(patch.image_url);
      if (patch.price_amount !== undefined && patch.price_amount !== null) {
        setPrice(String(patch.price_amount).replace(".", ","));
        setCurrency(patch.price_currency ?? "EUR");
        setEstimate(false);
      }
      const filled = Object.keys(patch).length > 0;
      setLinkNote(
        reply.missing.length
          ? `Dal link non ${reply.missing.length === 1 ? "è arrivato" : "sono arrivati"}: ${reply.missing.join(", ")}.${filled ? "" : " Niente da aggiungere."}`
          : filled
            ? "Dati recuperati dal link."
            : "La pagina è stata letta: i campi erano già compilati.",
      );
    } catch {
      setLinkNote("Per recuperare i dati serve la connessione. Il link resta salvato.");
    } finally {
      setFetching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim() || (validLink ? link : "");
    if (!clean) return setError("Scrivi un nome o incolla un link.");
    if (link && !validLink) return setError("Il link deve iniziare con http:// o https://");
    const amount = price.trim() ? parseAmount(price) : null;
    if (price.trim() && amount === null) return setError("Il prezzo non è un numero.");
    setBusy(true);
    setError(null);
    const ok = await onSave({
      name: clean,
      url: link || null,
      brand: brand.trim() || null,
      category: category.trim() || null,
      price_amount: amount,
      price_currency: amount === null ? null : currency.trim().toUpperCase() || "EUR",
      price_is_estimate: amount !== null && estimate,
      image_url: image || null,
      notes: notes.trim() || null,
      interest: Number(interest) as 1 | 2 | 3,
      status,
      // Cambiando il link senza rileggerlo, i dati del nuovo indirizzo si recuperano alla prossima apertura della wishlist.
      metadata_fetched_at: !link ? null : link === (item?.url ?? "") || fetchedHere ? fetchedAt : null,
    });
    if (!ok) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title={item ? "Articolo" : "Nuovo articolo"} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Field label="Link (facoltativo)" htmlFor="wish-url">
            <input id="wish-url" type="url" inputMode="url" value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setFetchedHere(false);
              }} autoComplete="off" autoCapitalize="none" placeholder="https://…" className={inputClass} />
          </Field>
          {validLink ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={recover} disabled={fetching || offline}>
                {fetching ? "Leggo la pagina…" : fetchedAt ? "Rileggi il link" : "Recupera dati dal link"}
              </Button>
              {offline ? <span className="text-xs text-text-3">Serve la connessione</span> : null}
            </div>
          ) : null}
          <p role="status" aria-live="polite" className={linkNote ? "text-sm text-text-2" : "sr-only"}>
            {linkNote}
          </p>
        </div>
        <Field label="Nome" htmlFor="wish-name">
          <input id="wish-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Es. siero vitamina C" className={inputClass} />
        </Field>
        <div className="flex gap-3">
          <Field label="Marca" htmlFor="wish-brand">
            <input id="wish-brand" value={brand} onChange={(e) => setBrand(e.target.value)} autoComplete="off" className={inputClass} />
          </Field>
          <Field label="Categoria" htmlFor="wish-category">
            <input id="wish-category" value={category} onChange={(e) => setCategory(e.target.value)} autoComplete="off" list="wish-categories" className={inputClass} />
            <datalist id="wish-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Prezzo" htmlFor="wish-price">
            <input id="wish-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoComplete="off" placeholder="19,90" className={inputClass} />
          </Field>
          <div className="w-24 shrink-0">
            <Field label="Valuta" htmlFor="wish-currency">
              <input id="wish-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} autoComplete="off" autoCapitalize="characters" className={inputClass} />
            </Field>
          </div>
        </div>
        <label className="-mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={estimate} onChange={(e) => setEstimate(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
          Prezzo indicativo
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-text-2">Quanto lo desideri</span>
          <Segmented label="Interesse" value={interest} options={INTERESTS} onChange={setInterest} />
        </div>
        <Field label="Note" htmlFor="wish-notes">
          <textarea id="wish-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} py-2.5`} />
        </Field>
        {item ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-2">Stato</span>
            <Segmented label="Stato" value={status} options={STATUSES} onChange={setStatus} />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {item ? (
            <Button variant="quiet" onClick={onDelete} className="-ml-4" disabled={busy}>
              Elimina
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={busy || fetching}>
            Salva
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
