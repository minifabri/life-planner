import { addDays, type LocalDate } from "../dates/local";
import { deterministicId, uuidv7 } from "../ids";
import {
  addMealOps,
  normalizeMealName,
  rememberMealOp,
  removeMealOps,
  renameMealOps,
  setModeOps,
  setPreparedOps,
} from "../meals/rules";
import { getSupabase } from "../supabase/client";
import type { MealMemory, MealPlan, MealSlot, PrepMode } from "../supabase/types";
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
        .select("id, slot, name_normalized, display_name, default_prep_mode, use_count, last_used_at"),
    ),
  );
}

export const mealsQuery = (from: LocalDate) => ({ queryKey: ["meals", from], queryFn: () => fetchMeals(from) });
export const mealMemoryQuery = { queryKey: ["meal-memory"], queryFn: fetchMealMemory, staleTime: 5 * 60_000 };

/** Una riga per piatto e momento: l'id nasce dal nome, così due dispositivi offline non ne creano due. */
async function rememberOp(slot: MealSlot, name: string, mode: PrepMode, now: string): Promise<Op> {
  const norm = normalizeMealName(name);
  const id = await deterministicId(`meal-memory:${await currentOwner()}:${slot}:${norm}`);
  const known = queryClient.getQueryData<MealMemory[]>(["meal-memory"])?.find((m) => m.id === id);
  return rememberMealOp(id, slot, name, mode, known, now);
}

export async function addMeal(date: LocalDate, slot: MealSlot, name: string, mode: PrepMode, today: LocalDate): Promise<void> {
  const meal = { id: uuidv7(), date, slot, name, prep_mode: mode };
  await commit([...addMealOps(meal, uuidv7(), today), await rememberOp(slot, name, mode, new Date().toISOString())]);
}

export async function setMealMode(meal: MealPlan, mode: PrepMode, today: LocalDate): Promise<void> {
  await commit(setModeOps(meal, mode, uuidv7(), today, new Date().toISOString()));
}

export async function setMealPrepared(meal: MealPlan, prepared: boolean): Promise<void> {
  await commit(setPreparedOps(meal, prepared, new Date().toISOString()));
}

export async function renameMeal(meal: MealPlan, name: string): Promise<void> {
  await commit([...renameMealOps(meal, name), await rememberOp(meal.slot, name, meal.prep_mode, new Date().toISOString())]);
}

export async function removeMeal(meal: MealPlan): Promise<void> {
  await commit(removeMealOps(meal, new Date().toISOString()));
}
