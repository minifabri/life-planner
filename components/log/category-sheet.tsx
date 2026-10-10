"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import type { CategoryInput } from "@/lib/data/log";
import type { LogCategory } from "@/lib/supabase/types";

/** I colori delle categorie predefinite: bastano a distinguerle con un punto. */
const COLORS: { value: string; name: string }[] = [
  { value: "#E7A2C6", name: "Rosa" },
  { value: "#82A8EC", name: "Azzurro" },
  { value: "#B9A4FF", name: "Lilla" },
  { value: "#D4B47A", name: "Sabbia" },
  { value: "#79C7B5", name: "Verde acqua" },
  { value: "#E9A873", name: "Arancio" },
  { value: "#A3A9B8", name: "Grigio" },
];

export function CategorySheet({
  category,
  onSave,
  onDelete,
  onClose,
}: {
  category: LogCategory | null;
  onSave: (input: CategoryInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#A3A9B8");
  const [sensitive, setSensitive] = useState(category?.is_sensitive ?? false);
  const [trackLast, setTrackLast] = useState(category?.track_last ?? true);
  const [keywords, setKeywords] = useState((category?.keywords ?? []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    setError(null);
    if (!(await action())) {
      setBusy(false);
      setError("Non salvato: serve la connessione.");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError("Scrivi un nome.");
    const words = [...new Set(keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))];
    void run(() => onSave({ name: clean, color, is_sensitive: sensitive, track_last: trackLast, keywords: words }));
  }

  return (
    <Sheet title={category ? "Categoria" : "Nuova categoria"} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="cat-name">
          <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inputClass} />
        </Field>
        <div role="radiogroup" aria-label="Colore" className="flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color.toLowerCase() === c.value.toLowerCase()}
              aria-label={c.name}
              onClick={() => setColor(c.value)}
              className={`flex size-11 items-center justify-center rounded-xl border ${
                color.toLowerCase() === c.value.toLowerCase() ? "border-line-2 bg-surface-2" : "border-transparent hover:bg-surface-2"
              }`}
            >
              <span className="size-3 rounded-full" style={{ background: c.value }} />
            </button>
          ))}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
          <span className="flex flex-col">
            Riservata
            <span className="text-xs text-text-3">Vale per le registrazioni nuove; quelle già salvate restano come sono.</span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={trackLast} onChange={(e) => setTrackLast(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
          Mostra &quot;ultima volta&quot;
        </label>
        <Field label="Parole che il Quick Capture riconosce, separate da virgola" htmlFor="cat-keywords">
          <input id="cat-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="unghie, semipermanente" className={inputClass} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line-2 px-3 py-3 text-sm">
            <p>Elimino la categoria? Le sue registrazioni restano, senza categoria.</p>
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Annulla
              </Button>
              <Button onClick={() => void run(onDelete)} disabled={busy}>
                Elimina
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {category ? (
              <Button variant="quiet" onClick={() => setConfirmDelete(true)} className="-ml-4" disabled={busy}>
                Elimina
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              Salva
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
