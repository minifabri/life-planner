"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { COLOR_OPTIONS, STYLE_OPTIONS } from "@/lib/wardrobe/categories";
import type { WardrobeStyle } from "@/lib/supabase/types";

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] capitalize transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-2">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => onChange(toggle(value, o))} className={chip(value.includes(o))}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Profilo di stile: orienta i suggerimenti, non vieta nulla. */
export function StyleSheet({ style, onSave, onClose }: { style: WardrobeStyle; onSave: (style: WardrobeStyle) => Promise<boolean>; onClose: () => void }) {
  const [likedStyles, setLikedStyles] = useState(style.liked_styles);
  const [likedColors, setLikedColors] = useState(style.liked_colors);
  const [avoid, setAvoid] = useState(style.avoid.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const words = avoid
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (!(await onSave({ liked_styles: likedStyles, liked_colors: likedColors, avoid: [...new Set(words)], weights: style.weights }))) {
      setBusy(false);
      setError("Non salvato: serve la connessione.");
    }
  }

  return (
    <Sheet title="Il mio stile" isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-text-2">Un punto di partenza per le idee: i capi fuori da queste preferenze scendono, non spariscono.</p>
        <Chips label="Stili che preferisco" options={STYLE_OPTIONS} value={likedStyles} onChange={setLikedStyles} />
        <Chips label="Colori che preferisco" options={COLOR_OPTIONS} value={likedColors} onChange={setLikedColors} />
        <Field label="Preferisco evitare (parole separate da virgola)" htmlFor="style-avoid">
          <textarea id="style-avoid" value={avoid} onChange={(e) => setAvoid(e.target.value)} rows={2} autoComplete="off" className={`${inputClass} py-2.5`} />
        </Field>
        <p className="-mt-2 text-xs text-text-3">Le parole si cercano in nome, sottocategoria, materiale e note dei capi. Basta l&apos;inizio: &quot;mocassin&quot; trova mocassino e mocassini.</p>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy}>
            Salva
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
