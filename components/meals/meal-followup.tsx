"use client";

import { useState } from "react";
import { Button } from "@/components/ui/form";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { useToast } from "@/components/ui/toast";
import { useTimezone } from "@/lib/data/hooks";
import { setMealPrepared, skipMealPrep, unskipMealPrep } from "@/lib/data/meals";
import { useMeals } from "@/lib/data/meals-hooks";
import { usePantryItems, useShoppingActions } from "@/lib/data/shopping-hooks";
import { addDays, startOfLocalDay, weekStart, type LocalDate } from "@/lib/dates/local";
import { prepKey, prepQuestions, usedIngredients, usedKey } from "@/lib/meals/followup";
import { SLOT_LABEL } from "@/lib/meals/rules";
import { pantryGroups } from "@/lib/shopping/pantry";
import type { MealPlan } from "@/lib/supabase/types";

/** Risposte "No" alle domande sui pasti: una comodità del dispositivo. Se si perdono, la domanda torna e basta. */
const ASKED_KEY = "planner-meal-asked";

function readAsked(): string[] {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeAsked(keys: string[]) {
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify(keys.slice(-60)));
  } catch {
    // Non salvato: la domanda tornerà alla prossima apertura.
  }
}

/** Il nome del piatto tra virgolette: senza articolo, che dipende dal nome. */
const dish = (meal: MealPlan) => `«${meal.name}»`;

/**
 * Domande sui pasti di ieri, in Oggi (D70): l'app non sa se un pasto da preparare è stato preparato, né se
 * gli ingredienti usati sono finiti, e lo chiede. Senza domande non mostra nulla.
 */
export function MealFollowUp({ today }: { today: LocalDate }) {
  const tz = useTimezone();
  const toast = useToast();
  const yesterday = addDays(today, -1);
  const meals = useMeals(weekStart(yesterday)).data;
  const pantryItems = usePantryItems().data;
  const shopping = useShoppingActions();
  const [asked, setAsked] = useState<string[]>(readAsked);

  if (!meals) return null;
  const prep = prepQuestions(meals, yesterday, asked);
  const pantry = pantryGroups(pantryItems ?? []).flatMap((g) => g.entries);
  const used = usedIngredients(meals, pantry, yesterday, startOfLocalDay(today, tz).toISOString(), asked);
  if (prep.length === 0 && used.length === 0) return null;

  function remember(key: string) {
    const next = [...asked, key];
    setAsked(next);
    writeAsked(next);
  }

  function forget(key: string) {
    const next = readAsked().filter((k) => k !== key);
    setAsked(next);
    writeAsked(next);
  }

  async function prepared(meal: MealPlan) {
    try {
      await setMealPrepared(meal, true);
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: `${meal.name}: preparato`, actionLabel: "Annulla", onAction: () => void setMealPrepared(meal, false).catch(() => {}) });
  }

  async function notPrepared(meal: MealPlan) {
    remember(prepKey(meal));
    try {
      await skipMealPrep(meal);
    } catch {
      // La domanda resta chiusa comunque: l'attività si può chiudere da Oggi.
    }
    toast({
      message: meal.reminder_task_id ? "Preparazione tolta da Oggi" : "Va bene",
      actionLabel: "Annulla",
      onAction: () => {
        forget(prepKey(meal));
        void unskipMealPrep(meal).catch(() => {});
      },
    });
  }

  return (
    <section aria-label="Pasti di ieri" className="flex flex-col gap-2">
      <h2 className="label-mono">Pasti di ieri</h2>
      <ul className="flex flex-col gap-2">
        {prep.map((meal) => (
          <li key={meal.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
            <p className="text-sm">
              Hai preparato {dish(meal)}? <span className="text-text-2">· {SLOT_LABEL[meal.slot].toLowerCase()}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void prepared(meal)}>Sì</Button>
              <Button variant="quiet" onClick={() => void notPrepared(meal)}>
                No
              </Button>
            </div>
          </li>
        ))}

        {used.length > 0 ? (
          <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
            <p className="text-sm">
              Ieri hai usato {used.length === 1 ? "un ingrediente" : `${used.length} ingredienti`} di casa. È finito qualcosa?
            </p>
            <div role="group" aria-label="Ingredienti finiti" className="-mx-1 flex flex-wrap gap-1">
              {used.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => void shopping.finish(entry.name, entry.items)}
                  aria-label={`Finito: ${entry.name}`}
                  style={departmentStyle(entry.department)}
                  className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <span className="flex text-(--dept)">
                    <ProductIcon name={entry.name} department={entry.department} size={16} />
                  </span>
                  {entry.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="quiet" onClick={() => remember(usedKey(yesterday))}>
                No, c&apos;è ancora tutto
              </Button>
            </div>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
