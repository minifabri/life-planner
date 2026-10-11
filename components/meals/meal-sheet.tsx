"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Sheet } from "@/components/ui/sheet";
import { addIngredient, ingredientsIn } from "@/lib/meals/ingredients";
import { SLOT_LABEL, normalizeMealName } from "@/lib/meals/rules";
import type { PantryEntry } from "@/lib/shopping/pantry";
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
  pantry,
  onAdd,
  onRename,
  onRemove,
  onClose,
}: {
  slot: MealSlot;
  dayLabel: string;
  meal: MealPlan | undefined;
  suggestions: MealMemory[];
  /** Gli ingredienti in casa non ancora usati in un pasto: un tocco li mette nel nome. */
  pantry: PantryEntry[];
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
  const named = ingredientsIn(name, pantry);
  const unused = pantry.filter((entry) => !named.includes(entry));
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
        {unused.length > 0 ? (
          <section className="-mt-1 flex flex-col gap-1.5">
            <h3 className="label-mono">In casa, da usare</h3>
            <ul className="flex flex-wrap gap-1.5">
              {unused.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => setName(addIngredient(name, entry.name))}
                    aria-label={`Aggiungi al piatto: ${entry.name}`}
                    style={departmentStyle(entry.department)}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-bg px-3 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                  >
                    <span className="flex text-(--dept)">
                      <ProductIcon name={entry.name} department={entry.department} size={16} />
                    </span>
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
