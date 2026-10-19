"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/form";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { useToast } from "@/components/ui/toast";
import { useTimezone } from "@/lib/data/hooks";
import { confirmMealsEaten, removeMeal, restoreMeal, setMealPrepared, skipMealPrep, unconfirmMealsEaten, unskipMealPrep } from "@/lib/data/meals";
import { useMeals } from "@/lib/data/meals-hooks";
import { usePantryItems, useShoppingActions } from "@/lib/data/shopping-hooks";
import { addDays, startOfLocalDay, weekStart, type LocalDate } from "@/lib/dates/local";
import { eatenKey, eatenQuestion, prepKey, prepQuestions, usedIngredients, usedKey } from "@/lib/meals/followup";
import { openMealsDay } from "@/lib/nav/meals-day-handoff";
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
 * Domande sui pasti di ieri, in Oggi (D70): l'app non sa se i pasti sono andati come previsto, se un pasto da
 * preparare è stato preparato, né se gli ingredienti usati sono finiti, e lo chiede. Senza domande non mostra nulla.
 */
export function MealFollowUp({ today }: { today: LocalDate }) {
  const tz = useTimezone();
  const toast = useToast();
  const yesterday = addDays(today, -1);
  const meals = useMeals(weekStart(yesterday)).data;
  const pantryItems = usePantryItems().data;
  const shopping = useShoppingActions();
  const router = useRouter();
  const [asked, setAsked] = useState<string[]>(readAsked);
  // "Non tutto": i pasti uno per uno; `answered` sono quelli già sistemati.
  const [detail, setDetail] = useState(false);
  const [answered, setAnswered] = useState<string[]>([]);

  if (!meals) return null;
  const eaten = eatenQuestion(meals, yesterday, asked);
  // Finché c'è la domanda sui pasti, quella sulla preparazione è compresa: "Mangiato" vuol dire anche preparato.
  const prep = eaten.length > 0 ? [] : prepQuestions(meals, yesterday, asked);
  const pantry = pantryGroups(pantryItems ?? []).flatMap((g) => g.entries);
  const used = usedIngredients(meals, pantry, yesterday, startOfLocalDay(today, tz).toISOString(), asked);
  if (eaten.length === 0 && prep.length === 0 && used.length === 0) return null;

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

  async function attempt(write: () => Promise<void>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
      return false;
    }
  }

  function allEaten() {
    const before = eaten;
    remember(eatenKey(yesterday));
    void attempt(() => confirmMealsEaten(before));
    toast({
      message: "Pasti di ieri confermati",
      actionLabel: "Annulla",
      onAction: () => {
        forget(eatenKey(yesterday));
        void unconfirmMealsEaten(before).catch(() => {});
      },
    });
  }

  /** Un pasto sistemato; quando lo sono tutti, la domanda si chiude. */
  function settle(meal: MealPlan) {
    const next = [...answered, meal.id];
    setAnswered(next);
    if (eaten.every((m) => next.includes(m.id))) {
      remember(eatenKey(yesterday));
      setDetail(false);
    }
  }

  function rowEaten(meal: MealPlan) {
    settle(meal);
    if (meal.prep_mode === "to_prep" && !meal.prepared) void attempt(() => setMealPrepared(meal, true));
  }

  async function rowSkipped(meal: MealPlan) {
    if (!(await attempt(() => removeMeal(meal)))) return;
    settle(meal);
    toast({ message: `${meal.name}: tolto, non conta nei nutrienti`, actionLabel: "Annulla", onAction: () => void restoreMeal(meal).catch(() => {}) });
  }

  function rowChanged(meal: MealPlan) {
    settle(meal);
    openMealsDay(yesterday);
    router.push("/lists/meals");
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
        {eaten.length > 0 ? (
          <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
            <p className="text-sm">Ieri hai mangiato come previsto?</p>
            {detail ? (
              <ul aria-label="Pasti di ieri, uno per uno" className="flex flex-col gap-2">
                {eaten
                  .filter((m) => !answered.includes(m.id))
                  .map((meal) => (
                    <li key={meal.id} className="flex flex-col gap-1">
                      <p className="text-sm">
                        <span className="text-text-2">{SLOT_LABEL[meal.slot]} · </span>
                        {meal.name}
                      </p>
                      <div className="-ml-1 flex flex-wrap gap-1">
                        <Button variant="quiet" onClick={() => rowEaten(meal)}>
                          Mangiato
                        </Button>
                        <Button variant="quiet" onClick={() => void rowSkipped(meal)}>
                          Saltato
                        </Button>
                        <Button variant="quiet" onClick={() => rowChanged(meal)}>
                          Cambiato
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <>
                <ul className="flex flex-col gap-0.5 text-xs text-text-2">
                  {eaten.map((meal) => (
                    <li key={meal.id}>
                      {SLOT_LABEL[meal.slot]} · <span className="text-text">{meal.name}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={allEaten}>Sì</Button>
                  <Button variant="quiet" onClick={() => setDetail(true)}>
                    Non tutto
                  </Button>
                </div>
              </>
            )}
          </li>
        ) : null}

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
