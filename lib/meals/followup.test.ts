import { describe, expect, it } from "vitest";
import type { PantryEntry } from "../shopping/pantry";
import type { MealPlan, MealSlot, ShoppingItem } from "../supabase/types";
import { confirmEatenOps, eatenKey, eatenQuestion, prepKey, prepQuestions, restoreMealOps, skipPrepOps, unconfirmEatenOps, unskipPrepOps, usedIngredients, usedKey } from "./followup";

const YESTERDAY = "2026-10-17";
const TODAY_START = "2026-10-17T22:00:00.000Z";

function meal(name: string, slot: MealSlot, patch: Partial<MealPlan> = {}): MealPlan {
  return { id: `${slot}-${name}`, date: YESTERDAY, slot, name, prep_mode: "ready", eaten_out: false, condiments: "", prepared: false, prepared_at: null, reminder_task_id: null, ...patch };
}

function entry(name: string, checkedAt = "2026-10-15T10:00:00.000Z"): PantryEntry {
  const item: ShoppingItem = {
    id: name,
    list_id: "l",
    name,
    quantity: null,
    department: null,
    checked: true,
    checked_at: checkedAt,
    finished_at: null,
    urgent: false,
    task_id: null,
    deleted_at: null,
    created_at: "2026-10-14T10:00:00.000Z",
  };
  return { key: name.toLowerCase(), name, quantity: null, department: null, items: [item] };
}

describe("prepQuestions", () => {
  it("chiede dei pasti di ieri da preparare e non preparati, nell'ordine della giornata", () => {
    const meals = [
      meal("Lenticchie", "dinner", { prep_mode: "to_prep" }),
      meal("Overnight oats", "breakfast", { prep_mode: "to_prep" }),
      meal("Hummus", "lunch", { prep_mode: "to_prep", prepared: true }),
      meal("Insalata", "snack"),
      meal("Pizza", "lunch", { prep_mode: "to_prep", eaten_out: true }),
      meal("Ceci", "lunch", { prep_mode: "to_prep", date: "2026-10-16" }),
    ];
    expect(prepQuestions(meals, YESTERDAY, []).map((m) => m.name)).toEqual(["Overnight oats", "Lenticchie"]);
  });

  it("non richiede dopo un No", () => {
    const m = meal("Lenticchie", "dinner", { prep_mode: "to_prep" });
    expect(prepQuestions([m], YESTERDAY, [prepKey(m)])).toEqual([]);
  });
});

describe("usedIngredients", () => {
  it("trova gli ingredienti in casa nominati nei pasti di ieri, una volta sola", () => {
    const pantry = [entry("Ceci"), entry("Zucchine"), entry("Riso")];
    const meals = [meal("Pasta e ceci", "lunch"), meal("Zucchine e ceci", "dinner", { condiments: "olio" })];
    expect(usedIngredients(meals, pantry, YESTERDAY, TODAY_START, []).map((e) => e.name)).toEqual(["Ceci", "Zucchine"]);
  });

  it("esclude i pasti fuori, gli ingredienti comprati oggi e il giorno già risposto", () => {
    const pantry = [entry("Ceci"), entry("Tofu", "2026-10-18T08:00:00.000Z")];
    expect(usedIngredients([meal("Tofu e ceci", "dinner", { eaten_out: true })], pantry, YESTERDAY, TODAY_START, [])).toEqual([]);
    expect(usedIngredients([meal("Tofu e ceci", "dinner")], pantry, YESTERDAY, TODAY_START, []).map((e) => e.name)).toEqual(["Ceci"]);
    expect(usedIngredients([meal("Tofu e ceci", "dinner")], pantry, YESTERDAY, TODAY_START, [usedKey(YESTERDAY)])).toEqual([]);
  });

  it("conta anche i condimenti", () => {
    expect(usedIngredients([meal("Insalata", "lunch", { condiments: "tahina" })], [entry("Tahina")], YESTERDAY, TODAY_START, []).map((e) => e.name)).toEqual(["Tahina"]);
  });
});

describe("skipPrepOps", () => {
  it("chiude l'attività di preparazione solo se aperta, e l'annulla la riapre", () => {
    expect(skipPrepOps({ reminder_task_id: null })).toEqual([]);
    expect(skipPrepOps({ reminder_task_id: "t" })).toEqual([
      { kind: "update", table: "tasks", patch: { status: "dismissed" }, where: [["id", "eq", "t"], ["status", "eq", "open"]] },
    ]);
    expect(unskipPrepOps({ reminder_task_id: "t" })[0]).toMatchObject({ patch: { status: "open" }, where: [["id", "eq", "t"], ["status", "eq", "dismissed"]] });
  });
});

describe("eatenQuestion", () => {
  it("elenca i pasti di ieri scritti in casa, nell'ordine della giornata", () => {
    const meals = [meal("Pasta e ceci", "dinner"), meal("Porridge", "breakfast"), meal("Pizza", "lunch", { eaten_out: true }), meal("Mela", "snack", { date: "2026-10-16" })];
    expect(eatenQuestion(meals, YESTERDAY, []).map((m) => m.name)).toEqual(["Porridge", "Pasta e ceci"]);
    expect(eatenQuestion(meals, YESTERDAY, [eatenKey(YESTERDAY)])).toEqual([]);
  });

  it("confermare segna preparati i pasti da preparare, e si annulla", () => {
    const meals = [meal("Lenticchie", "dinner", { prep_mode: "to_prep", reminder_task_id: "t" }), meal("Porridge", "breakfast")];
    const ops = confirmEatenOps(meals, "2026-10-18T08:00:00.000Z");
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ table: "meal_plans", patch: { prepared: true } });
    expect(ops[1]).toMatchObject({ table: "tasks", patch: { status: "done" } });
    expect(unconfirmEatenOps(meals, "2026-10-18T08:00:00.000Z")[0]).toMatchObject({ patch: { prepared: false } });
  });

  it("un pasto saltato torna com'era, senza attività", () => {
    const m = meal("Lenticchie", "dinner", { prep_mode: "to_prep", reminder_task_id: "t" });
    expect(restoreMealOps(m)).toEqual([{ kind: "insert", table: "meal_plans", row: { ...m, reminder_task_id: null } }]);
  });
});
