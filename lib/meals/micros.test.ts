import { describe, expect, it } from "vitest";
import type { MealPlan, MealSlot } from "../supabase/types";
import { DISHES } from "./dishes";
import { daySummary, recognizeMicros, rowsNote } from "./micros";
import { nutrientOverrides } from "./nutrients";

const DAY = "2026-10-12";

let n = 0;
const meal = (name: string, slot: MealSlot = "lunch"): MealPlan => ({
  id: `m${n++}`,
  date: DAY,
  slot,
  name,
  prep_mode: "ready",
  eaten_out: false,
  prepared: false,
  prepared_at: null,
  reminder_task_id: null,
});

describe("recognizeMicros", () => {
  it("riconosce le buone fonti nel nome, al singolare e al plurale", () => {
    expect(recognizeMicros("Riso e lenticchie")).toEqual(["iron", "zinc", "folate"]);
    expect(recognizeMicros("Carote")).toEqual(["vitA"]);
    expect(recognizeMicros("Carota e arancia")).toEqual(["vitA", "vitC", "folate"]);
    expect(recognizeMicros("Tofu, riso e broccoli")).toEqual(["iron", "calcium", "zinc", "vitA", "vitC", "folate"]);
  });

  it("legge due parole insieme, che valgono al posto delle singole", () => {
    expect(recognizeMicros("Semi di lino")).toEqual(["omega3"]);
    expect(recognizeMicros("Semi di zucca")).toEqual(["iron", "zinc"]);
    expect(recognizeMicros("Zucca al forno")).toEqual(["vitA"]);
    expect(recognizeMicros("Frutta secca")).toEqual(["zinc"]);
    expect(recognizeMicros("Frutta")).toEqual(["vitC"]);
    expect(recognizeMicros("Patata dolce")).toEqual(["vitA", "vitC"]);
  });

  it("non confonde le parole simili", () => {
    expect(recognizeMicros("Zucchine")).toEqual([]);
    expect(recognizeMicros("Patatine")).toEqual([]);
    expect(recognizeMicros("Granola")).toEqual(["zinc"]);
    expect(recognizeMicros("Fette biscottate")).toEqual([]);
  });

  it("vuoto se il nome non dice nulla", () => {
    expect(recognizeMicros("Pasta")).toEqual([]);
    expect(recognizeMicros("Avanzi di ieri")).toEqual([]);
    expect(recognizeMicros("")).toEqual([]);
  });

  it("riconosce almeno un micronutriente in tutti i piatti proposti dall'app", () => {
    expect(DISHES.filter((d) => recognizeMicros(d.name).length === 0).map((d) => d.name)).toEqual([]);
  });
});

describe("daySummary", () => {
  const count = (rows: { key: string; meals: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r.meals]));

  it("conta in quanti pasti del giorno compare ogni nutriente e micronutriente", () => {
    const summary = daySummary([meal("Porridge di avena e banana", "breakfast"), meal("Riso e lenticchie"), meal("Avanzi", "dinner")]);
    expect(summary.planned).toBe(3);
    expect(summary.recognized).toBe(2);
    expect(count(summary.nutrients)).toEqual({ protein: 1, carbs: 2, fat: 0, fiber: 2 });
    expect(count(summary.micros)).toEqual({ iron: 2, calcium: 0, zinc: 2, omega3: 0, vitA: 0, vitC: 0, folate: 1 });
  });

  it("gli extra contano come un pasto in più; un pasto fuori senza nome non conta", () => {
    const summary = daySummary([meal("Riso e lenticchie"), meal("Olio e noci", "extra"), { ...meal("", "dinner"), eaten_out: true }]);
    expect(summary.planned).toBe(2);
    expect(summary.recognized).toBe(2);
    expect(count(summary.nutrients)).toEqual({ protein: 1, carbs: 1, fat: 1, fiber: 2 });
    expect(count(summary.micros).omega3).toBe(1);
  });

  it("un pasto corretto a mano conta tra i riconosciuti anche se il nome non dice nulla", () => {
    const overrides = nutrientOverrides([
      { id: "a", slot: "dinner", name_normalized: "avanzi", display_name: "Avanzi", default_prep_mode: "ready", use_count: 1, last_used_at: null, nutrients: ["protein"], hidden_at: null },
    ]);
    const summary = daySummary([meal("Avanzi", "dinner")], overrides);
    expect(summary.recognized).toBe(1);
    expect(count(summary.nutrients).protein).toBe(1);
  });
});

describe("rowsNote", () => {
  const rows = (meals: number[]) => daySummary([]).micros.map((r, i) => ({ ...r, meals: meals[i] }));

  it("nomina il gruppo più corto", () => {
    expect(rowsNote(rows([1, 0, 2, 0, 1, 1, 1]))).toBe("mancano calcio e omega-3");
    expect(rowsNote(rows([1, 1, 2, 0, 1, 1, 1]))).toBe("manca omega-3");
    expect(rowsNote(rows([1, 0, 0, 0, 0, 1, 0]))).toBe("solo ferro e vitamina C");
    expect(rowsNote(rows([1, 1, 1, 1, 1, 1, 1]))).toBe("ci sono tutti");
    expect(rowsNote(rows([0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});
