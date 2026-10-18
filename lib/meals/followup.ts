import type { LocalDate } from "../dates/local";
import type { PantryEntry } from "../shopping/pantry";
import type { MealPlan } from "../supabase/types";
import { byId, type Op } from "../sync/ops";
import { ingredientsIn } from "./ingredients";
import { SLOTS, mealFoods } from "./rules";

/**
 * Domande sui pasti di ieri, in Oggi (D70: chiedere, non decidere). L'app non sa se un pasto da preparare
 * è stato preparato, né se un ingrediente usato è finito: lo chiede, una volta, con risposta a un tocco.
 * `dismissed` sono le chiavi delle domande a cui è già stato risposto "No" (`prepKey`, `usedKey`).
 */

export const prepKey = (meal: Pick<MealPlan, "id">) => `prep:${meal.id}`;
export const usedKey = (date: LocalDate) => `used:${date}`;

const bySlot = (a: MealPlan, b: MealPlan) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);

/** I pasti di `day` da preparare e non segnati come preparati, nell'ordine della giornata. */
export function prepQuestions(meals: MealPlan[], day: LocalDate, dismissed: string[]): MealPlan[] {
  return meals
    .filter((m) => m.date === day && !m.eaten_out && m.prep_mode === "to_prep" && !m.prepared && !dismissed.includes(prepKey(m)))
    .sort(bySlot);
}

/**
 * Gli ingredienti in casa nominati nei pasti di `day` (mangiati fuori esclusi), comprati prima di `before`
 * (istante ISO: di norma l'inizio di oggi). Un ingrediente comprato dopo non può essere stato usato ieri.
 */
export function usedIngredients(meals: MealPlan[], pantry: PantryEntry[], day: LocalDate, before: string, dismissed: string[]): PantryEntry[] {
  if (dismissed.includes(usedKey(day))) return [];
  const bought = pantry.filter((e) => e.items.some((i) => (i.checked_at ?? i.created_at) < before));
  const used: PantryEntry[] = [];
  for (const meal of meals.filter((m) => m.date === day && !m.eaten_out).sort(bySlot)) {
    for (const entry of ingredientsIn(mealFoods(meal), bought)) if (!used.includes(entry)) used.push(entry);
  }
  return used;
}

/** "No, non l'ho preparato": il pasto è passato, la sua attività di preparazione ancora aperta si chiude. */
export function skipPrepOps(meal: Pick<MealPlan, "reminder_task_id">): Op[] {
  if (!meal.reminder_task_id) return [];
  return [{ kind: "update", table: "tasks", patch: { status: "dismissed" }, where: [...byId(meal.reminder_task_id), ["status", "eq", "open"]] }];
}

/** Annulla di `skipPrepOps`. */
export function unskipPrepOps(meal: Pick<MealPlan, "reminder_task_id">): Op[] {
  if (!meal.reminder_task_id) return [];
  return [{ kind: "update", table: "tasks", patch: { status: "open" }, where: [...byId(meal.reminder_task_id), ["status", "eq", "dismissed"]] }];
}
