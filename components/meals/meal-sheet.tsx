"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { SLOT_LABEL, normalizeMealName } from "@/lib/meals/rules";
import type { MealMemory, MealPlan, MealSlot, PrepMode } from "@/lib/supabase/types";

const MODES: { value: PrepMode; label: string }[] = [
  { value: "ready", label: "Pronto" },
  { value: "to_prep", label: "Da preparare" },
];

/** Foglio di un pasto: per uno vuoto propone i ricorrenti di quel momento, per uno esistente permette di cambiarlo o toglierlo. */
export function MealSheet({
  slot,
  dayLabel,
  meal,
  suggestions,
  onAdd,
  onRename,
  onRemove,
  onClose,
}: {
  slot: MealSlot;
  dayLabel: string;
  meal: MealPlan | undefined;
  suggestions: MealMemory[];
  onAdd: (name: string, mode: PrepMode) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [mode, setMode] = useState<PrepMode>(meal?.prep_mode ?? "ready");
  const trimmed = name.trim();
  // Scrivendo un nome già noto si riprende la sua modalità abituale, finché non la si cambia a mano.
  const known = suggestions.find((s) => s.name_normalized === normalizeMealName(trimmed));
  const [modeTouched, setModeTouched] = useState(false);
  const effectiveMode = !meal && !modeTouched && known ? known.default_prep_mode : mode;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    if (meal) onRename(trimmed);
    else onAdd(trimmed, effectiveMode);
  }

  return (
    <Sheet title={`${SLOT_LABEL[slot]} · ${dayLabel}`} isOpen onClose={onClose}>
      {!meal && suggestions.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono">Ricorrenti</h3>
          <ul className="flex flex-col rounded-xl border border-line bg-bg px-3">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAdd(s.display_name, s.default_prep_mode)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]"
                >
                  <span className="flex min-w-0 flex-col gap-0.5 py-1.5">
                    <span className="break-words">{s.display_name}</span>
                    <span className="text-xs text-text-3">{s.default_prep_mode === "to_prep" ? "Da preparare" : "Pronto"}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-text-3">{s.use_count === 1 ? "1 volta" : `${s.use_count} volte`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={meal ? "Piatto" : suggestions.length > 0 ? "Oppure un piatto nuovo" : "Piatto"} htmlFor="meal-name">
          <input
            id="meal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. riso e lenticchie"
            autoComplete="off"
            enterKeyHint="done"
            className={inputClass}
          />
        </Field>
        {!meal ? (
          <Segmented
            label="Modalità"
            value={effectiveMode}
            options={MODES}
            onChange={(value) => {
              setMode(value);
              setModeTouched(true);
            }}
          />
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {meal ? (
            <Button variant="quiet" onClick={onRemove} className="-ml-4">
              Togli il pasto
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={!trimmed || (!!meal && trimmed === meal.name)}>
            {meal ? "Salva" : "Aggiungi"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
