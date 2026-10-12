import { describe, expect, it } from "vitest";
import type { MealMemory, MealPlan, MealSlot } from "../supabase/types";
import { DISHES } from "./dishes";
import { balanceNote, dayNutrients, nutrientOverrides, nutrientsOf, recognizeNutrients, weekBalance } from "./nutrients";

const DAYS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

let n = 0;
const meal = (date: string, name: string, slot: MealSlot = "lunch"): MealPlan => ({
  id: `m${n++}`,
  date,
  slot,
  name,
  prep_mode: "ready",
  prepared: false,
  prepared_at: null,
  reminder_task_id: null,
});

const memory = (name: string, over: Partial<MealMemory> = {}): MealMemory => ({
  id: name,
  slot: "lunch",
  name_normalized: name,
  display_name: name,
  default_prep_mode: "ready",
  use_count: 1,
  last_used_at: null,
  nutrients: null,
  hidden_at: null,
  ...over,
});

describe("recognizeNutrients", () => {
  it("riconosce gli alimenti nel nome, al singolare e al plurale", () => {
    expect(recognizeNutrients("Riso e lenticchie")).toEqual(["protein", "carbs", "fiber"]);
    expect(recognizeNutrients("Pollo con zucchina")).toEqual(["protein", "fiber"]);
    expect(recognizeNutrients("Pollo con zucchine")).toEqual(["protein", "fiber"]);
    expect(recognizeNutrients("Uovo sodo")).toEqual(["protein", "fat"]);
    expect(recognizeNutrients("Uova e funghi")).toEqual(["protein", "fat", "fiber"]);
  });

  it("non tiene conto di maiuscole e accenti", () => {
    expect(recognizeNutrients("PASTA AL RAGÙ")).toEqual(["protein", "carbs", "fat"]);
  });

  it("legge due parole insieme, anche con una preposizione in mezzo", () => {
    expect(recognizeNutrients("Fiocchi di latte")).toEqual(["protein"]);
    expect(recognizeNutrients("Frutta secca")).toEqual(["fat", "fiber"]);
    expect(recognizeNutrients("Yogurt e frutti di bosco")).toEqual(["protein", "fiber"]);
  });

  it("\"integrale\" aggiunge le fibre", () => {
    expect(recognizeNutrients("Pane")).toEqual(["carbs"]);
    expect(recognizeNutrients("Pane integrale")).toEqual(["carbs", "fiber"]);
  });

  it("non confonde le parole con la stessa radice", () => {
    expect(recognizeNutrients("Pesce al forno")).toEqual(["protein"]);
    expect(recognizeNutrients("Pesca")).toEqual(["fiber"]);
    expect(recognizeNutrients("Qualcosa per cena")).toEqual([]);
    expect(recognizeNutrients("Pera")).toEqual(["fiber"]);
  });

  it("vuoto se il nome non dice nulla", () => {
    expect(recognizeNutrients("Avanzi di ieri")).toEqual([]);
    expect(recognizeNutrients("")).toEqual([]);
  });

  it("riconosce tutti i piatti proposti dall'app", () => {
    expect(DISHES.filter((d) => recognizeNutrients(d.name).length < 2).map((d) => d.name)).toEqual([]);
  });
});

describe("nutrientsOf", () => {
  it("la correzione a mano vince sul nome, in qualunque momento della giornata", () => {
    const overrides = nutrientOverrides([memory("avanzi di ieri", { slot: "dinner", nutrients: ["fiber", "protein"] }), memory("pane")]);
    expect(nutrientsOf("Avanzi di  Ieri", overrides)).toEqual(["protein", "fiber"]);
    expect(nutrientsOf("Pane", overrides)).toEqual(["carbs"]);
  });

  it("una correzione vuota vuol dire nessun nutriente", () => {
    expect(nutrientsOf("Pane", nutrientOverrides([memory("pane", { nutrients: [] })]))).toEqual([]);
  });
});

describe("weekBalance", () => {
  it("conta i pasti con ogni nutriente, in tutto e giorno per giorno", () => {
    const balance = weekBalance([meal(DAYS[0], "Riso e lenticchie"), meal(DAYS[0], "Yogurt", "breakfast"), meal(DAYS[2], "Avanzi"), meal("2026-10-19", "Pollo")], DAYS);
    expect(balance.planned).toBe(3);
    expect(balance.recognized).toBe(2);
    const protein = balance.rows.find((r) => r.nutrient === "protein");
    expect(protein).toMatchObject({ meals: 2, perDay: [2, 0, 0, 0, 0, 0, 0], low: false });
  });

  it("segnala ciò che scarseggia solo con abbastanza pasti riconosciuti", () => {
    const few = weekBalance([meal(DAYS[0], "Pasta"), meal(DAYS[1], "Riso")], DAYS);
    expect(few.rows.some((r) => r.low)).toBe(false);
    expect(balanceNote(few)).toBe("Ancora pochi pasti per dire com'è distribuita.");

    const carbs = weekBalance([meal(DAYS[0], "Pasta"), meal(DAYS[1], "Riso"), meal(DAYS[2], "Gnocchi"), meal(DAYS[3], "Pane e pollo")], DAYS);
    expect(carbs.rows.filter((r) => r.low).map((r) => r.nutrient)).toEqual(["protein", "fat", "fiber"]);
    expect(balanceNote(carbs)).toBe("Poche proteine, pochi grassi e poche fibre nella settimana.");
  });

  it("settimana ben distribuita", () => {
    const meals = DAYS.slice(0, 4).map((d) => meal(d, "Salmone, riso e broccoli"));
    expect(balanceNote(weekBalance(meals, DAYS))).toBe("Settimana ben distribuita.");
    expect(balanceNote(weekBalance([], DAYS))).toBe("Nessun pasto in programma.");
  });
});

describe("dayNutrients", () => {
  it("dice cosa c'è e cosa manca nel giorno", () => {
    expect(dayNutrients([meal(DAYS[0], "Pasta al pomodoro"), meal(DAYS[0], "Yogurt", "snack")])).toEqual({ present: ["protein", "carbs", "fiber"], missing: ["fat"] });
  });
});
