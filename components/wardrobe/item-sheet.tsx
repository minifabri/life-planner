"use client";

import { useRef, useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { CategoryIcon } from "@/components/wardrobe/category-icon";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { suggestDefaults } from "@/lib/wardrobe/catalog";
import { suggestName } from "@/lib/wardrobe/colors";
import { detectColors } from "@/lib/wardrobe/image";
import { CATEGORIES, CATEGORY_LABEL, COLOR_OPTIONS, OCCASION_OPTIONS, SEASONS, SEASON_LABEL, STATUSES, STATUS_LABEL, STYLE_OPTIONS } from "@/lib/wardrobe/categories";
import type { WardrobeCategory, WardrobeItem, WardrobeStatus } from "@/lib/supabase/types";
import type { WardrobeInput } from "@/lib/data/wardrobe";

export type ItemSave = WardrobeInput & { photo: File | null };

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

const chip = (active: boolean) =>
  `flex min-h-9 shrink-0 items-center rounded-lg border px-2.5 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

function ChipGroup({ label, options, labels, value, onChange }: { label: string; options: string[]; labels?: Record<string, string>; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-2">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => onChange(toggle(value, o))} className={`${chip(value.includes(o))} ${labels ? "" : "capitalize"}`}>
            {labels?.[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Nuovo capo o modifica: solo la categoria è obbligatoria, tutto il resto si può aggiungere dopo. */
export function ItemSheet({
  item,
  onSave,
  onDelete,
  onDuplicate,
  onMatch,
  usage,
  onClose,
}: {
  item: WardrobeItem | null;
  onSave: (input: ItemSave) => Promise<boolean>;
  onDelete: () => void;
  onDuplicate?: () => void;
  /** Apre le idee di abbinamento intorno a questo capo. */
  onMatch?: () => void;
  /** Quante volte è stato indossato e quando l'ultima, già in parole. */
  usage?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<WardrobeCategory>(item?.category ?? "top");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [colors, setColors] = useState<string[]>(item?.colors ?? []);
  const [seasons, setSeasons] = useState<string[]>(item?.seasons ?? []);
  const [styles, setStyles] = useState<string[]>(item?.styles ?? []);
  const [occasions, setOccasions] = useState<string[]>(item?.occasions ?? []);
  const [material, setMaterial] = useState(item?.material ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [warmth, setWarmth] = useState<1 | 2 | 3 | 4 | 5 | null>(item?.warmth ?? null);
  const [layerable, setLayerable] = useState(item?.layerable ?? true);
  const [favorite, setFavorite] = useState(item?.favorite ?? false);
  const [status, setStatus] = useState<WardrobeStatus>(item?.status ?? "clean");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [showMore, setShowMore] = useState(!!item);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(!item);
  // Nome e colori proposti dall'app finché non li tocchi: il nome segue tipo e colore, i colori vengono dalla foto.
  const [nameAuto, setNameAuto] = useState(!item);
  const [colorsAuto, setColorsAuto] = useState(!item);
  const [detected, setDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function applySuggestion(nextCategory: WardrobeCategory, nextName: string) {
    const s = suggestDefaults(nextCategory, nextName);
    setSeasons(s.seasons);
    setStyles(s.styles);
    setOccasions(s.occasions);
    setWarmth(s.warmth);
    setLayerable(s.layerable);
  }

  function proposeName(nextCategory: WardrobeCategory, nextSubcategory: string, nextColors: string[]) {
    if (nameAuto) setName(suggestName(nextCategory, nextSubcategory || null, nextColors));
  }

  async function readColors(file: File) {
    const found = await detectColors(file);
    if (found.length === 0) return;
    setColors(found);
    setDetected(true);
    proposeName(category, subcategory, found);
  }

  function pickPhoto(file: File | null) {
    if (file && colorsAuto) void readColors(file);
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await onSave({
      name: name.trim() || null,
      category,
      subcategory: subcategory.trim() || null,
      colors,
      seasons,
      styles,
      occasions,
      material: material.trim() || null,
      brand: brand.trim() || null,
      warmth,
      layerable,
      status,
      favorite,
      notes: notes.trim() || null,
      photo,
    });
    if (!ok) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title={item ? "Capo" : "Nuovo capo"} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={photo || item ? "Cambia foto" : "Aggiungi foto"}
            className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-2 text-text-3"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="size-full object-cover" />
            ) : item ? (
              <WardrobePhoto item={item} />
            ) : (
              <CategoryIcon category={category} />
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col gap-1">
            <Button onClick={() => fileInput.current?.click()}>{photo ? "Cambia foto" : "Scatta o carica una foto"}</Button>
            <span className="text-xs text-text-3">Facoltativa: si può aggiungere anche dopo.</span>
          </div>
        </div>

        <Field label="Nome (facoltativo)" htmlFor="wardrobe-name">
          <input
            id="wardrobe-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Svuotando il campo si torna alla proposta dell'app.
              setNameAuto(e.target.value.trim() === "");
            }}
            onBlur={() => {
              if (autoFilled) applySuggestion(category, name);
            }}
            autoComplete="off"
            placeholder="Es. Maglia nera semitrasparente"
            className={inputClass}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-text-2">Categoria</span>
          <div role="group" aria-label="Categoria" className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => {
                  setCategory(c);
                  if (autoFilled) applySuggestion(c, name);
                  proposeName(c, subcategory, colors);
                }}
                className={chip(category === c)}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {detected ? (
          <p role="status" className="-mt-1 text-xs text-text-3">
            Dalla foto: {colors.join(", ")}. Se non torna, correggi i colori in &quot;Altri dettagli&quot;.
          </p>
        ) : null}

        <button type="button" onClick={() => setShowMore((v) => !v)} className="-mx-1 flex min-h-9 items-center gap-1.5 self-start rounded-lg px-1 text-sm text-accent">
          {showMore ? "Nascondi altri dettagli" : "Altri dettagli"}
          <Icon name={showMore ? "chevronLeft" : "chevronRight"} size={14} className={showMore ? "-rotate-90" : "rotate-90"} />
        </button>

        {showMore ? (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Field label="Sottocategoria" htmlFor="wardrobe-subcategory">
                <input
                  id="wardrobe-subcategory"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  onBlur={() => proposeName(category, subcategory.trim(), colors)}
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
              <Field label="Marca" htmlFor="wardrobe-brand">
                <input id="wardrobe-brand" value={brand} onChange={(e) => setBrand(e.target.value)} autoComplete="off" className={inputClass} />
              </Field>
            </div>

            <ChipGroup label="Colori" options={COLOR_OPTIONS} value={colors} onChange={(v) => { setColors(v); setColorsAuto(false); setDetected(false); setAutoFilled(false); proposeName(category, subcategory, v); }} />
            <ChipGroup label="Stagioni" options={SEASONS} labels={SEASON_LABEL} value={seasons} onChange={(v) => { setSeasons(v); setAutoFilled(false); }} />
            <ChipGroup label="Stili" options={STYLE_OPTIONS} value={styles} onChange={(v) => { setStyles(v); setAutoFilled(false); }} />
            <ChipGroup label="Occasioni" options={OCCASION_OPTIONS} value={occasions} onChange={(v) => { setOccasions(v); setAutoFilled(false); }} />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-2">Pesantezza (leggero → pesante)</span>
              <div role="group" aria-label="Pesantezza" className="flex gap-1.5">
                {([1, 2, 3, 4, 5] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={warmth === w}
                    onClick={() => { setWarmth(w); setAutoFilled(false); }}
                    className={`flex min-h-9 flex-1 items-center justify-center rounded-lg border text-[13px] ${warmth === w ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2"}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Materiale" htmlFor="wardrobe-material">
              <input id="wardrobe-material" value={material} onChange={(e) => setMaterial(e.target.value)} autoComplete="off" className={inputClass} />
            </Field>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={layerable} onChange={(e) => { setLayerable(e.target.checked); setAutoFilled(false); }} className="size-5 accent-[var(--accent-fill)]" />
              Si può indossare a strati
            </label>
            <label className="-mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
              Preferito
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-2">Stato</span>
              <Segmented label="Stato" value={status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} onChange={setStatus} />
            </div>

            <Field label="Note" htmlFor="wardrobe-notes">
              <textarea id="wardrobe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} py-2.5`} />
            </Field>
          </div>
        ) : null}

        {item && usage ? <p className="text-xs text-text-3">{usage}</p> : null}

        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {item ? (
            <div className="-ml-4 flex flex-wrap gap-1">
              <Button variant="quiet" onClick={onDelete} disabled={busy}>
                Elimina
              </Button>
              {onDuplicate ? (
                <Button variant="quiet" onClick={onDuplicate} disabled={busy}>
                  Duplica
                </Button>
              ) : null}
              {onMatch ? (
                <Button variant="quiet" onClick={onMatch} disabled={busy}>
                  Abbina
                </Button>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            Salva
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
