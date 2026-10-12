import { addDays, type LocalDate } from "../dates/local";
import { deterministicId, uuidv7 } from "../ids";
import {
  addMealOps,
  hideIdeaOp,
  normalizeMealName,
  rememberMealOp,
  removeMealOps,
  renameMealOps,
  setModeOps,
  setNutrientsOps,
  setPreparedOps,
} from "../meals/rules";
import { getSupabase } from "../supabase/client";
import type { MealMemory, MealPlan, MealSlot, Nutrient, PrepMode } from "../supabase/types";
import { commit, currentOwner, withPendingMealMemory, withPendingMeals } from "../sync/engine";
import type { Op } from "../sync/ops";
import { queryClient } from "./query-client";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** I pasti dei sette giorni da `from`. */
export async function fetchMeals(from: LocalDate): Promise<MealPlan[]> {
  return withPendingMeals(
    check(
      await getSupabase()
        .from("meal_plans")
        .select("id, date, slot, name, prep_mode, prepared, prepared_at, reminder_task_id")
        .gte("date", from)
        .lte("date", addDays(from, 6)),
    ),
    from,
  );
}

export async function fetchMealMemory(): Promise<MealMemory[]> {
  return withPendingMealMemory(
    check(
      await getSupabase()
        .from("meal_memory")
        .select("id, slot, name_normalized, display_name, default_prep_mode, use_count, last_used_at, nutrients, hidden_at"),
    ),
  );
}

export const mealsQuery = (from: LocalDate) => ({ queryKey: ["meals", from], queryFn: () => fetchMeals(from) });
export const mealMemoryQuery = { queryKey: ["meal-memory"], queryFn: fetchMealMemory, staleTime: 5 * 60_000 };

/** Una riga per piatto e momento: l'id nasce dal nome, così due dispositivi offline non ne creano due. */
async function memoryId(slot: MealSlot, name: string): Promise<string> {
  return deterministicId(`meal-memory:${await currentOwner()}:${slot}:${normalizeMealName(name)}`);
}

function knownMemory(): MealMemory[] {
  return queryClient.getQueryData<MealMemory[]>(["meal-memory"]) ?? [];
}

/**
 * Ricorda il piatto in questo momento. Con `nutrients` dato salva anche la correzione dei nutrienti
 * (`null` = di nuovo dal nome), su questa riga e sulle altre con lo stesso nome.
 */
async function rememberOps(slot: MealSlot, name: string, mode: PrepMode, now: string, nutrients?: Nutrient[] | null): Promise<Op[]> {
  const id = await memoryId(slot, name);
  const memory = knownMemory();
  const remember = rememberMealOp(id, slot, name, mode, memory.find((m) => m.id === id), now, nutrients);
  if (nutrients === undefined) return [remember];
  return [remember, ...setNutrientsOps(memory.filter((m) => m.id !== id), id, slot, name, mode, nutrients).filter((op) => op.kind === "update")];
}

export async function addMeal(date: LocalDate, slot: MealSlot, name: string, mode: PrepMode, today: LocalDate, nutrients?: Nutrient[] | null): Promise<void> {
  const meal = { id: uuidv7(), date, slot, name, prep_mode: mode };
  await commit([...addMealOps(meal, uuidv7(), today), ...(await rememberOps(slot, name, mode, new Date().toISOString(), nutrients))]);
}

export async function setMealMode(meal: MealPlan, mode: PrepMode, today: LocalDate): Promise<void> {
  await commit(setModeOps(meal, mode, uuidv7(), today, new Date().toISOString()));
}

export async function setMealPrepared(meal: MealPlan, prepared: boolean): Promise<void> {
  await commit(setPreparedOps(meal, prepared, new Date().toISOString()));
}

export async function renameMeal(meal: MealPlan, name: string, nutrients?: Nutrient[] | null): Promise<void> {
  await commit([...renameMealOps(meal, name), ...(await rememberOps(meal.slot, name, meal.prep_mode, new Date().toISOString(), nutrients))]);
}

/** Corregge i nutrienti del piatto di un pasto, senza contarlo come un uso in più. */
export async function setMealNutrients(meal: MealPlan, nutrients: Nutrient[] | null): Promise<void> {
  await commit(setNutrientsOps(knownMemory(), await memoryId(meal.slot, meal.name), meal.slot, meal.name, meal.prep_mode, nutrients));
}

/** "Non proporre" nelle Idee di un momento; `hidden` falso lo rimette. */
export async function hideMealIdea(slot: MealSlot, name: string, mode: PrepMode, hidden: boolean): Promise<void> {
  const id = await memoryId(slot, name);
  await commit([hideIdeaOp(id, slot, name, mode, knownMemory().find((m) => m.id === id), hidden ? new Date().toISOString() : null)]);
}

export async function removeMeal(meal: MealPlan): Promise<void> {
  await commit(removeMealOps(meal, new Date().toISOString()));
}
