"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { GUIDED_PROMPT, parseImport, type ImportRow } from "@/lib/wishlist/chatgpt";
import { formatPrice } from "@/lib/wishlist/price";

type Draft = ImportRow & { key: number; selected: boolean };

/** Incolla da testo (D21): prima il testo, poi l'anteprima degli articoli riconosciuti, da confermare. */
export function ImportSheet({ onImport, onClose }: { onImport: (rows: ImportRow[]) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = rows?.filter((r) => r.selected && r.name.trim()) ?? [];

  function read() {
    const parsed = parseImport(text);
    if (parsed.length === 0) return setError("Non ho trovato prodotti in questo testo. Prova con un elenco, uno per riga.");
    setError(null);
    setRows(parsed.map((r, key) => ({ ...r, key, selected: true })));
  }

  function change(key: number, patch: Partial<Draft>) {
    setRows((old) => old?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const ok = await onImport(
      selected.map((r) => ({
        name: r.name.trim(),
        brand: r.brand,
        category: r.category,
        price_amount: r.price_amount,
        price_currency: r.price_currency,
        price_is_estimate: r.price_is_estimate,
        notes: r.notes,
        recognized: r.recognized,
      })),
    );
    if (!ok) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title={rows ? "Controlla gli articoli" : "Incolla da testo"} isOpen onClose={onClose}>
      {!rows ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg px-3 py-3">
            <p className="text-xs text-text-2">Aggiungi questa frase alla tua richiesta a ChatGPT:</p>
            <p className="text-sm">{GUIDED_PROMPT}</p>
            <Button
              className="self-start"
              onClick={() => {
                navigator.clipboard
                  .writeText(GUIDED_PROMPT)
                  .then(() => setCopied(true))
                  .catch(() => setError("Non riesco a copiare: seleziona la frase a mano."));
              }}
            >
              {copied ? "Copiata" : "Copia la frase"}
            </Button>
          </div>
          <Field label="Incolla qui la risposta" htmlFor="wish-import">
            <textarea id="wish-import" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Nome | Marca | Categoria | Prezzo indicativo | Nota breve" className={`${inputClass} py-2.5`} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button variant="primary" onClick={read} disabled={!text.trim()}>
              Leggi il testo
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">Togli la spunta a ciò che non vuoi e correggi i nomi. Il resto si modifica dopo, dall&apos;articolo.</p>
          <ul className="flex flex-col">
            {rows.map((row) => {
              const details = [row.brand, row.category, formatPrice(row.price_amount, row.price_currency, row.price_is_estimate), row.notes].filter(Boolean);
              return (
                <li key={row.key} className="flex items-start gap-1 border-b border-line py-2 last:border-b-0">
                  <label className="-ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input type="checkbox" checked={row.selected} onChange={(e) => change(row.key, { selected: e.target.checked })} aria-label={`Importa: ${row.name}`} className="size-5 accent-[var(--accent-fill)]" />
                  </label>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`wish-row-${row.key}`} className="sr-only">
                      Nome dell&apos;articolo {row.key + 1}
                    </label>
                    <input id={`wish-row-${row.key}`} value={row.name} onChange={(e) => change(row.key, { name: e.target.value })} autoComplete="off" className={inputClass} />
                    <span className="text-xs text-text-3">{row.recognized ? details.join(" · ") || "Solo il nome" : "Riga non riconosciuta: controlla il nome"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {error ? (
            <p role="alert" className="text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Button variant="quiet" onClick={() => setRows(null)} className="-ml-4" disabled={busy}>
              Torna al testo
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || selected.length === 0}>
              {selected.length === 1 ? "Aggiungi 1 articolo" : `Aggiungi ${selected.length} articoli`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
