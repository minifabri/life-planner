"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import type { LogEntryInput } from "@/lib/data/log";
import { trimTime, type LocalDate } from "@/lib/dates/local";
import { parseTags } from "@/lib/log/timeline";
import type { LogCategory, LogEntry } from "@/lib/supabase/types";

/** Nuova registrazione o modifica di una esistente. */
export function EntrySheet({
  entry,
  categories,
  today,
  defaultCategoryId,
  onSave,
  onDelete,
  onClose,
}: {
  entry: LogEntry | null;
  categories: LogCategory[];
  today: LocalDate;
  defaultCategoryId: string | null;
  onSave: (input: LogEntryInput) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [categoryId, setCategoryId] = useState(entry?.category_id ?? defaultCategoryId ?? "");
  const [date, setDate] = useState(entry?.date ?? today);
  const [time, setTime] = useState(entry?.time ? trimTime(entry.time) : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [tags, setTags] = useState((entry?.tags ?? []).join(", "));
  // La riservatezza segue la categoria finché non la si cambia a mano.
  const [sensitiveChoice, setSensitiveChoice] = useState<boolean | null>(entry ? entry.is_sensitive : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId);
  const sensitive = sensitiveChoice ?? category?.is_sensitive ?? false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return setError("Scrivi un titolo.");
    if (!date) return setError("Scegli una data.");
    setBusy(true);
    setError(null);
    const ok = await onSave({
      title: clean,
      category_id: categoryId || null,
      date,
      time: time || null,
      notes: notes.trim() || null,
      tags: parseTags(tags),
      is_sensitive: sensitive,
    });
    if (!ok) {
      setBusy(false);
      setError(sensitive ? "Non salvata: per le registrazioni riservate serve la connessione." : "Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title={entry ? "Registrazione" : "Nuova registrazione"} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Titolo" htmlFor="log-title">
          <input id="log-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" placeholder="Es. semipermanente viola" className={inputClass} />
        </Field>
        <Field label="Categoria" htmlFor="log-category">
          <select
            id="log-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              if (!entry) setSensitiveChoice(null);
            }}
            className={inputClass}
          >
            <option value="">Nessuna</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_sensitive ? " (riservata)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3">
          <Field label="Data" htmlFor="log-date">
            <input id="log-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ora (facoltativa)" htmlFor="log-time">
            <input id="log-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Note" htmlFor="log-notes">
          <textarea id="log-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} py-2.5`} />
        </Field>
        <Field label="Tag, separati da virgola" htmlFor="log-tags">
          <input id="log-tags" value={tags} onChange={(e) => setTags(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="viola, gel" className={inputClass} />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitiveChoice(e.target.checked)} className="size-5 accent-[var(--accent-fill)]" />
          <span className="flex flex-col">
            Riservata
            <span className="text-xs text-text-3">Si vede solo a Log sbloccato; altrove compare con un titolo neutro.</span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {entry ? (
            <Button variant="quiet" onClick={onDelete} className="-ml-4" disabled={busy}>
              Elimina
            </Button>
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
