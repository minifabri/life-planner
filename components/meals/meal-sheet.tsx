"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Sheet } from "@/components/ui/sheet";
import { addIngredient, ingredientsIn } from "@/lib/meals/ingredients";
import { NUTRIENTS, NUTRIENT_LABEL, nutrientsOf, recognizeNutrients, sameNutrients, type Overrides } from "@/lib/meals/nutrients";
import { SLOT_LABEL, normalizeMealName } from "@/lib/meals/rules";
import type { Idea } from "@/lib/meals/suggest";
import type { PantryEntry } from "@/lib/shopping/pantry";
import type { MealMemory, MealPlan, MealSlot, Nutrient, PrepMode } from "@/lib/supabase/types";

const PLACEHOLDER: Record<MealSlot, string> = {
  breakfast: "Es. porridge di avena e banana",
  lunch: "Es. riso e lenticchie",
  snack: "Es. frutta e mandorle",
  dinner: "Es. zuppa di ceci e crostini",
  extra: "Es. olio, noci, cioccolato fondente",
};

/** Quante idee si vedono insieme nel foglio. */
const IDEAS = 3;
const RECURRING = 6;

const MODES: { value: PrepMode; label: string }[] = [
  { value: "ready", label: "Pronto" },
  { value: "to_prep", label: "Da preparare" },
];

/**
 * Foglio di un pasto: per uno vuoto propone i ricorrenti di quel momento, per uno esistente permette di cambiarlo o toglierlo.
 * Vale anche per gli extra del giorno (`slot` "extra"), che non hanno modalità né "mangiato fuori".
 */
export function MealSheet({
  slot,
  dayLabel,
  meal,
  suggestions,
  ideas,
  onLess,
  pantry,
  overrides,
  onAdd,
  onSave,
  onRemove,
  onClose,
}: {
  slot: MealSlot;
  dayLabel: string;
  meal: MealPlan | undefined;
  suggestions: MealMemory[];
  /** Le idee per questo momento, dalla più adatta (vuoto dove non servono: pasto già scelto, extra, giorni passati). */
  ideas: Idea[];
  /** "Meno spesso": l'idea esce dall'elenco e ne arriva un'altra. */
  onLess: (idea: Idea) => void;
  /** Gli ingredienti in casa non ancora usati in un pasto: un tocco li mette nel nome. */
  pantry: PantryEntry[];
  /** I nutrienti già corretti a mano, per nome del piatto. */
  overrides: Overrides;
  /** `nutrients` c'è solo se sono stati corretti: l'elenco scelto, o `null` per tornare a quelli del nome. */
  onAdd: (name: string, mode: PrepMode, nutrients?: Nutrient[] | null, out?: boolean) => void;
  onSave: (name: string, out: boolean, nutrients?: Nutrient[] | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [mode, setMode] = useState<PrepMode>(meal?.prep_mode ?? "ready");
  const trimmed = name.trim();
  const extra = slot === "extra";
  // Idee: non quelle già qui sopra tra i ricorrenti. Tre alla volta, "Altre idee" gira.
  const listed = new Set(suggestions.slice(0, RECURRING).map((s) => s.name_normalized));
  const fresh = ideas.filter((i) => !listed.has(i.key));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(fresh.length / IDEAS));
  const shown = fresh.slice((page % pages) * IDEAS, (page % pages) * IDEAS + IDEAS);
  // Mangiato fuori: il piatto è facoltativo e non c'è niente da preparare.
  const [out, setOut] = useState(meal?.eaten_out ?? false);
  // Scrivendo un nome già noto si riprende la sua modalità abituale, finché non la si cambia a mano.
  const known = suggestions.find((s) => s.name_normalized === normalizeMealName(trimmed));
  const [modeTouched, setModeTouched] = useState(false);
  const named = ingredientsIn(name, pantry);
  const unused = pantry.filter((entry) => !named.includes(entry));
  const effectiveMode = !meal && !modeTouched && known ? known.default_prep_mode : mode;

  // Nutrienti: finché non si toccano seguono il nome (o la correzione già salvata per quel piatto).
  const [picked, setPicked] = useState<Nutrient[] | null>(null);
  const nutrients = picked ?? nutrientsOf(trimmed, overrides);
  const saved = overrides.get(normalizeMealName(trimmed)) ?? null;
  // Tornare a ciò che il nome dice già toglie la correzione.
  const wanted = picked && !sameNutrients(picked, recognizeNutrients(trimmed)) ? picked : null;
  const corrected = picked !== null && !(wanted === null ? saved === null : saved !== null && sameNutrients(wanted, saved));

  function toggle(nutrient: Nutrient) {
    setPicked(nutrients.includes(nutrient) ? nutrients.filter((n) => n !== nutrient) : NUTRIENTS.filter((n) => n === nutrient || nutrients.includes(n)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed && !out) return;
    if (meal) onSave(trimmed, out, corrected ? wanted : undefined);
    else onAdd(trimmed, out || extra ? "ready" : effectiveMode, corrected ? wanted : undefined, out);
  }

  return (
    <Sheet title={`${SLOT_LABEL[slot]} · ${dayLabel}`} isOpen onClose={onClose}>
      {!meal && suggestions.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono">{extra ? "Extra ricorrenti" : "Ricorrenti"}</h3>
          <ul className="flex flex-col rounded-xl border border-line bg-bg px-3">
            {suggestions.slice(0, RECURRING).map((s) => (
              <li key={s.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAdd(s.display_name, s.default_prep_mode)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]"
                >
                  <span className="flex min-w-0 flex-col gap-0.5 py-1.5">
                    <span className="break-words">{s.display_name}</span>
                    {extra ? null : <span className="text-xs text-text-3">{s.default_prep_mode === "to_prep" ? "Da preparare" : "Pronto"}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-text-3">{s.use_count === 1 ? "1 volta" : `${s.use_count} volte`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!meal && shown.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono">Idee</h3>
          <ul className="flex flex-col rounded-xl border border-line bg-bg pl-3 pr-1">
            {shown.map((idea) => (
              <li key={idea.key} className="flex items-center gap-1 border-b border-line last:border-b-0">
                <button type="button" onClick={() => onAdd(idea.name, idea.mode)} className="flex min-h-11 min-w-0 flex-1 flex-col gap-0.5 py-1.5 text-left text-[15px]">
                  <span className="break-words">{idea.name}</span>
                  <span className="text-xs text-text-3">{idea.reason}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onLess(idea)}
                  aria-label={`Meno spesso: ${idea.name}`}
                  className="min-h-11 shrink-0 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  Meno
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <Button variant="quiet" className="-ml-4 self-start" onClick={() => setPage(page + 1)}>
              Altre idee
            </Button>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {extra ? null : (
          <label className="-my-1 -ml-2.5 flex min-h-11 cursor-pointer items-center gap-1 self-start pr-2 text-sm">
            <span className="flex size-11 items-center justify-center">
              <input type="checkbox" className="peer sr-only" checked={out} onChange={(e) => setOut(e.target.checked)} />
              <span
                className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                  out ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
                }`}
              >
                <Icon name="check" size={14} strokeWidth={2.2} />
              </span>
            </span>
            Mangiato fuori
          </label>
        )}
        <Field
          label={extra ? "Fuori pasto e condimenti" : out ? "Piatto (facoltativo)" : meal ? "Piatto" : suggestions.length > 0 || shown.length > 0 ? "Oppure un piatto nuovo" : "Piatto"}
          htmlFor="meal-name"
        >
          <input
            id="meal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={PLACEHOLDER[slot]}
            autoComplete="off"
            enterKeyHint="done"
            className={inputClass}
          />
        </Field>
        {out && !trimmed ? <p className="-mt-2 text-xs text-text-3">Senza piatto il pasto resta segnato, ma non conta nei nutrienti.</p> : null}
        {extra ? <p className="-mt-2 text-xs text-text-3">Contano nei nutrienti del giorno e della settimana come un pasto in più.</p> : null}
        {unused.length > 0 && !out ? (
          <section className="-mt-1 flex flex-col gap-1.5">
            <h3 className="label-mono">In casa, da usare</h3>
            <ul className="flex flex-wrap gap-1.5">
              {unused.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => setName(addIngredient(name, entry.name))}
                    aria-label={`Aggiungi ${extra ? "agli extra" : "al piatto"}: ${entry.name}`}
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
        {trimmed ? (
          <section className="-mt-1 flex flex-col gap-1.5">
            <h3 className="label-mono">Nutrienti</h3>
            <div role="group" aria-label={extra ? "Nutrienti degli extra" : "Nutrienti del piatto"} className="flex flex-wrap gap-1.5">
              {NUTRIENTS.map((n) => {
                const on = nutrients.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(n)}
                    className={`flex min-h-11 items-center rounded-xl border px-3 text-sm transition-colors ${
                      on ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-3 hover:text-text"
                    }`}
                  >
                    {NUTRIENT_LABEL[n]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-text-3">
              {picked || saved ? (extra ? "Scelti a mano." : "Scelti a mano per questo piatto.") : nutrients.length > 0 ? "Riconosciuti dal nome. Correggili se serve." : "Il nome non li dice: indicali tu, se vuoi."}
            </p>
          </section>
        ) : null}
        {!meal && !out && !extra ? (
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
              {extra ? "Togli gli extra" : "Togli il pasto"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={(!trimmed && !out) || (!!meal && trimmed === meal.name && out === meal.eaten_out && !corrected)}>
            {meal ? "Salva" : "Aggiungi"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
