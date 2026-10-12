import type { MealSlot, PrepMode } from "../supabase/types";

/**
 * Piatti semplici proposti nelle Idee oltre a quelli già usati. Sono tutti vegani, per chiunque usi l'app:
 * niente carne, pesce, uova, latticini o miele (lo verifica un test). I nutrienti non sono scritti qui:
 * si ricavano dal nome come per ogni altro piatto (`recognizeNutrients`).
 */
export type Dish = { name: string; slots: MealSlot[]; mode: PrepMode };

const dish = (name: string, slots: MealSlot[], mode: PrepMode = "ready"): Dish => ({ name, slots, mode });

const MAIN: MealSlot[] = ["lunch", "dinner"];

export const DISHES: Dish[] = [
  dish("Yogurt di soia, frutta e noci", ["breakfast"]),
  dish("Porridge di avena e banana", ["breakfast"]),
  dish("Porridge di avena e frutti di bosco", ["breakfast"]),
  dish("Pane integrale, hummus e pomodori", ["breakfast"]),
  dish("Pane integrale e burro di arachidi", ["breakfast"]),
  dish("Latte di soia e cereali integrali", ["breakfast"]),
  dish("Toast con avocado e pomodorini", ["breakfast"]),
  dish("Yogurt di soia e muesli", ["breakfast"]),

  dish("Frutta e mandorle", ["snack"]),
  dish("Yogurt di soia e frutta", ["snack"]),
  dish("Hummus e carote", ["snack"]),
  dish("Pane e burro di arachidi", ["snack"]),
  dish("Gallette e avocado", ["snack"]),
  dish("Mela e noci", ["snack"]),
  dish("Cioccolato fondente e nocciole", ["snack"]),
  dish("Edamame", ["snack"]),

  dish("Riso e lenticchie", MAIN, "to_prep"),
  dish("Pasta e ceci", MAIN, "to_prep"),
  dish("Pasta e fagioli", MAIN, "to_prep"),
  dish("Pasta integrale al pomodoro e lenticchie", MAIN),
  dish("Pasta con zucchine e noci", MAIN),
  dish("Farro con verdure e ceci", ["lunch"], "to_prep"),
  dish("Insalata di ceci, pomodori e avocado", ["lunch"]),
  dish("Insalata di riso con fagioli e verdure", ["lunch"], "to_prep"),
  dish("Panino con hummus e verdure", ["lunch"]),
  dish("Cous cous con verdure e ceci", MAIN, "to_prep"),
  dish("Quinoa, zucchine e tofu", MAIN),
  dish("Orzo con funghi e piselli", MAIN, "to_prep"),
  dish("Tofu, riso e verdure", MAIN),
  dish("Tofu, patate e fagiolini", MAIN),
  dish("Tempeh, riso e broccoli", MAIN),
  dish("Seitan, patate e insalata", MAIN),
  dish("Lenticchie, patate e spinaci", MAIN),
  dish("Fagioli, riso e avocado", MAIN),
  dish("Burger di legumi, pane e insalata", MAIN),
  dish("Polpette di legumi e insalata", MAIN, "to_prep"),
  dish("Minestrone con fagioli", MAIN, "to_prep"),
  dish("Zuppa di lenticchie e crostini", MAIN, "to_prep"),
  dish("Vellutata di zucca, ceci e crostini", ["dinner"], "to_prep"),
  dish("Farinata di ceci e verdure", ["dinner"]),
];
