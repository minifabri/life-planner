import type { MealSlot, PrepMode } from "../supabase/types";

/**
 * Piatti semplici proposti nelle Idee oltre a quelli già usati. I nutrienti non sono scritti qui:
 * si ricavano dal nome come per ogni altro piatto (`recognizeNutrients`).
 */
export type Dish = { name: string; slots: MealSlot[]; mode: PrepMode };

const dish = (name: string, slots: MealSlot[], mode: PrepMode = "ready"): Dish => ({ name, slots, mode });

const MAIN: MealSlot[] = ["lunch", "dinner"];

export const DISHES: Dish[] = [
  dish("Yogurt greco, frutta e noci", ["breakfast"]),
  dish("Porridge di avena e banana", ["breakfast"]),
  dish("Pane integrale e uova", ["breakfast"]),
  dish("Pane, ricotta e miele", ["breakfast"]),
  dish("Latte e cereali integrali", ["breakfast"]),
  dish("Toast con avocado e uovo", ["breakfast"]),
  dish("Yogurt e muesli", ["breakfast"]),
  dish("Pancake di avena e frutti di bosco", ["breakfast"]),

  dish("Frutta e mandorle", ["snack"]),
  dish("Yogurt greco e miele", ["snack"]),
  dish("Hummus e carote", ["snack"]),
  dish("Pane e burro di arachidi", ["snack"]),
  dish("Gallette e ricotta", ["snack"]),
  dish("Mela e noci", ["snack"]),
  dish("Cioccolato fondente e nocciole", ["snack"]),
  dish("Kefir e frutta", ["snack"]),

  dish("Riso e lenticchie", MAIN, "to_prep"),
  dish("Pasta e ceci", MAIN, "to_prep"),
  dish("Pasta integrale al pomodoro e tonno", MAIN),
  dish("Farro con verdure e feta", ["lunch"], "to_prep"),
  dish("Insalata di ceci, pomodori e avocado", ["lunch"]),
  dish("Cous cous con verdure e ceci", MAIN, "to_prep"),
  dish("Insalata di riso con tonno e verdure", ["lunch"], "to_prep"),
  dish("Piadina con hummus e verdure", ["lunch"]),
  dish("Quinoa, zucchine e uova", MAIN),
  dish("Orzo con funghi e parmigiano", MAIN, "to_prep"),
  dish("Pasta con zucchine e ricotta", MAIN),
  dish("Pasta al pesto e fagiolini", MAIN),
  dish("Gnocchi al pomodoro e parmigiano", MAIN),
  dish("Mozzarella, pomodori e pane integrale", MAIN),
  dish("Pollo, patate e insalata", MAIN),
  dish("Tacchino, riso e spinaci", MAIN),
  dish("Salmone, riso e broccoli", MAIN),
  dish("Merluzzo, patate e fagiolini", MAIN),
  dish("Sgombro, patate e insalata", MAIN),
  dish("Tofu, riso e verdure", MAIN),
  dish("Frittata di zucchine e pane integrale", MAIN),
  dish("Uova, spinaci e pane integrale", ["dinner"]),
  dish("Minestrone con fagioli", MAIN, "to_prep"),
  dish("Zuppa di lenticchie e crostini", MAIN, "to_prep"),
  dish("Vellutata di zucca, ceci e crostini", ["dinner"], "to_prep"),
  dish("Polpette di legumi e insalata", MAIN, "to_prep"),
];
