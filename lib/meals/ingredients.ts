import type { LocalDate } from "../dates/local";
import { normalizeName } from "../shopping/entry";
import type { MealPlan } from "../supabase/types";
import { SLOTS } from "./rules";

/**
 * Ingredienti in casa riconosciuti nei pasti (D45). I pasti sono testo libero: un ingrediente è "in uso"
 * quando la sua parola principale compare nel nome di un pasto, al singolare o al plurale.
 */

const STOP = new Set(
  "a ad al all alla alle allo agli ai e ed o con senza in di d del dell della delle dello dei degli da dal dalla per su il lo la l le i gli un una uno".split(" "),
);

/** Radice di una parola: "patata" e "patate", "fungo" e "funghi", "finocchio" e "finocchi" coincidono. */
function stem(word: string): string {
  if (word.length < 4) return word;
  return word.replace(/i?[aeiou]$/, "").replace(/h$/, "");
}

function words(name: string): string[] {
  return normalizeName(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

/** La parola che identifica un ingrediente: la prima che conta ("Yogurt greco" → yogurt). */
function head(name: string): string | undefined {
  return words(name)[0];
}

/** Gli ingredienti nominati in un pasto, nell'ordine in cui sono dati. */
export function ingredientsIn<T extends { name: string }>(mealName: string, ingredients: T[]): T[] {
  const inMeal = new Set(words(mealName));
  return ingredients.filter((i) => {
    const key = head(i.name);
    return key !== undefined && inMeal.has(key);
  });
}

/** I pasti da `from` in poi che nominano l'ingrediente, dal più vicino. */
export function mealsUsing(ingredient: string, meals: MealPlan[], from: LocalDate): MealPlan[] {
  const key = head(ingredient);
  if (key === undefined) return [];
  return meals
    .filter((m) => m.date >= from && words(m.name).includes(key))
    .sort((a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

/** Aggiunge un ingrediente al nome del pasto: "Patate" → "Patate e fagiolini" → "Patate, fagiolini e carote". */
export function addIngredient(mealName: string, ingredient: string): string {
  const name = mealName.replace(/\s+/g, " ").trim();
  const added = ingredient.trim();
  if (!name) return added.charAt(0).toUpperCase() + added.slice(1);
  const last = name.lastIndexOf(" e ");
  const list = last === -1 ? name : `${name.slice(0, last)}, ${name.slice(last + 3)}`;
  return `${list} e ${added.toLowerCase()}`;
}
