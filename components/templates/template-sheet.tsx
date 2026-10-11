"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import type { Area, Attention, Template, TemplateItem } from "@/lib/supabase/types";
import { MAX_OFFSET, cleanItems, emptyItem, offsetLabel } from "@/lib/templates/apply";

const ATTENTION_OPTIONS: { value: Attention; label: string }[] = [
  { value: "low", label: "Bassa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

type Line = TemplateItem & { key: number };

/** Crea o modifica un template: nome e attività, ognuna con la sua distanza dal giorno di partenza. */
export function TemplateSheet({
  template,
  initialItems,
  areas,
  onSave,
  onDelete,
  onClose,
}: {
  /** null per un template nuovo. */
  template: Template | null;
  /** Voci di partenza di un template nuovo (es. ricavate da attività esistenti). */
  initialItems?: TemplateItem[];
  areas: Area[];
  onSave: (name: string, items: TemplateItem[]) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [lines, setLines] = useState<Line[]>(() => {
    const start = template?.items ?? initialItems ?? [];
    return (start.length ? start : [emptyItem()]).map((item, key) => ({ ...item, key }));
  });
  const [nextKey, setNextKey] = useState(lines.length);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, change: Partial<TemplateItem>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...change } : l)));

  function addLine() {
    // La riga nuova parte dal giorno dell'ultima: di solito si scrive in ordine.
    setLines([...lines, { ...emptyItem(lines.at(-1)?.day_offset ?? 0), key: nextKey }]);
    setNextKey(nextKey + 1);
  }

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
    const items = cleanItems(lines);
    if (!name.trim()) return setError("Scrivi un nome.");
    if (items.length === 0) return setError("Aggiungi almeno un'attività.");
    void run(() => onSave(name.trim(), items));
  }

  return (
    <Sheet title={template ? "Template" : "Nuovo template"} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="tpl-name">
          <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Preparazione lezione yoga" className={inputClass} />
        </Field>

        <ol className="flex flex-col gap-3">
          {lines.map((line, index) => {
            const id = `tpl-${line.key}`;
            return (
              <li key={line.key}>
                <fieldset className="flex flex-col gap-3 rounded-[14px] border border-line px-3 py-3">
                  <legend className="sr-only">Attività {index + 1}</legend>
                  <div className="flex items-end gap-1">
                    <Field label={`Attività ${index + 1}`} htmlFor={`${id}-title`}>
                      <input id={`${id}-title`} value={line.title} onChange={(e) => patch(line.key, { title: e.target.value })} autoComplete="off" className={inputClass} />
                    </Field>
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                      disabled={lines.length === 1}
                      aria-label={`Togli l'attività ${index + 1}`}
                      className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-40"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Field label="Giorni dopo la partenza" htmlFor={`${id}-offset`}>
                      <input
                        id={`${id}-offset`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_OFFSET}
                        value={line.day_offset}
                        onChange={(e) => patch(line.key, { day_offset: Number(e.target.value) })}
                        aria-describedby={`${id}-when`}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Ora (facoltativa)" htmlFor={`${id}-time`}>
                      <input id={`${id}-time`} type="time" value={line.time ?? ""} onChange={(e) => patch(line.key, { time: e.target.value || null })} className={inputClass} />
                    </Field>
                    <Field label="Durata in minuti" htmlFor={`${id}-duration`}>
                      <input
                        id={`${id}-duration`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={line.duration_min ?? ""}
                        onChange={(e) => patch(line.key, { duration_min: e.target.value ? Number(e.target.value) : null })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <p id={`${id}-when`} className="-mt-1 text-xs text-text-3">
                    {offsetLabel(Math.max(0, Math.round(Number(line.day_offset) || 0)))}
                  </p>
                  {areas.length ? (
                    <Field label="Area" htmlFor={`${id}-area`}>
                      <select id={`${id}-area`} value={line.area_id ?? ""} onChange={(e) => patch(line.key, { area_id: e.target.value || null })} className={inputClass}>
                        <option value="">Nessuna</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Segmented label={`Attenzione dell'attività ${index + 1}`} value={line.attention} options={ATTENTION_OPTIONS} onChange={(attention) => patch(line.key, { attention })} />
                </fieldset>
              </li>
            );
          })}
        </ol>
        <Button onClick={addLine} className="self-start">
          Aggiungi un&apos;attività
        </Button>

        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line-2 px-3 py-3 text-sm">
            <p>Elimino il template? Le attività già create restano.</p>
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
            {template ? (
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
