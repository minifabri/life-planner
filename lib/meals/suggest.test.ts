import { describe, expect, it } from "vitest";
import type { MealMemory, MealPlan, MealSlot } from "../supabase/types";
import { suggestMeals, type IdeaContext, type IdeaData } from "./suggest";

const MON = "2026-10-12";
const WED = "2026-10-14";

let n = 0;
const meal = (date: string, slot: MealSlot, name: string): MealPlan => ({
  id: `m${n++}`,
  date,
  slot,
  name,
  prep_mode: "ready",
  eaten_out: false,
  prepared: false,
  prepared_at: null,
  reminder_task_id: null,
});

const memory = (name: string, over: Partial<MealMemory> = {}): MealMemory => ({
  id: `${over.slot ?? "lunch"}:${name}`,
  slot: "lunch",
  name_normalized: name.toLowerCase(),
  display_name: name,
  default_prep_mode: "ready",
  use_count: 1,
  last_used_at: null,
  nutrients: null,
  hidden_at: null,
  ...over,
});

const data = (over: Partial<IdeaData> = {}): IdeaData => ({ memory: [], meals: [], pantry: [], ...over });
const ctx = (over: Partial<IdeaContext> = {}): IdeaContext => ({ day: WED, slot: "lunch", weekFrom: MON, signs: [], ...over });

describe("suggestMeals", () => {
  it("senza storico propone i piatti dell'app adatti al momento", () => {
    const ideas = suggestMeals(data(), ctx({ slot: "breakfast" }));
    expect(ideas.length).toBeGreaterThan(3);
    expect(ideas.every((i) => i.isNew && i.slot === "breakfast")).toBe(true);
    expect(ideas[0].reason).toContain("Un piatto nuovo");
  });

  it("due piatti abituali ogni piatto nuovo", () => {
    const own = ["Pasta al pesto", "Insalatona", "Riso freddo", "Farro e ceci"].map((name) => memory(name, { use_count: 4 }));
    const ideas = suggestMeals(data({ memory: own }), ctx(), 6);
    expect(ideas.map((i) => i.isNew)).toEqual([false, false, true, false, false, true]);
  });

  it("propone solo i ricorrenti di quel momento, e non quelli mai usati", () => {
    const ideas = suggestMeals(data({ memory: [memory("Yogurt", { slot: "breakfast" }), memory("Riso", { use_count: 0 }), memory("Farro")] }), ctx(), 40);
    expect(ideas.filter((i) => !i.isNew).map((i) => i.name)).toEqual(["Farro"]);
  });

  it("non ripropone un piatto nascosto, nemmeno tra quelli dell'app", () => {
    const hidden = [memory("Farro", { hidden_at: "2026-10-12T08:00:00Z" }), memory("Riso e lenticchie", { use_count: 0, hidden_at: "2026-10-12T08:00:00Z" })];
    const names = suggestMeals(data({ memory: hidden }), ctx(), 40).map((i) => i.name);
    expect(names).not.toContain("Farro");
    expect(names).not.toContain("Riso e lenticchie");
    expect(suggestMeals(data(), ctx(), 40).map((i) => i.name)).toContain("Riso e lenticchie");
  });

  it("non propone un piatto dell'app già tra i ricorrenti, né uno già in programma nel giorno", () => {
    const ideas = suggestMeals(data({ memory: [memory("Riso e lenticchie"), memory("Farro")], meals: [meal(WED, "dinner", "farro")] }), ctx(), 40);
    expect(ideas.filter((i) => i.name === "Riso e lenticchie")).toHaveLength(1);
    expect(ideas.map((i) => i.name)).not.toContain("Farro");
  });

  it("preferisce ciò che porta i nutrienti scarsi nella settimana, e lo dice", () => {
    const meals = [meal(MON, "lunch", "Pasta"), meal(MON, "dinner", "Riso"), meal("2026-10-13", "lunch", "Gnocchi"), meal("2026-10-13", "dinner", "Pizza")];
    const own = [memory("Pane e marmellata", { use_count: 9 }), memory("Pollo e verdure")];
    const ideas = suggestMeals(data({ memory: own, meals }), ctx());
    expect(ideas[0].name).toBe("Pollo e verdure");
    expect(ideas[0].reason).toContain("Porta proteine e fibre, che scarseggiano nella settimana");
  });

  it("completa il giorno con ciò che manca agli altri pasti", () => {
    const ideas = suggestMeals(data({ memory: [memory("Pasta in bianco"), memory("Pollo")], meals: [meal(WED, "dinner", "Riso e zucchine")] }), ctx());
    expect(ideas[0].name).toBe("Pollo");
    expect(ideas[0].reason).toContain("Completa il giorno con proteine");
  });

  it("mette avanti ciò che usa un ingrediente in casa", () => {
    const own = [memory("Pasta al pomodoro"), memory("Pasta e zucchine")];
    const ideas = suggestMeals(data({ memory: own, pantry: [{ name: "Zucchine" }] }), ctx());
    expect(ideas[0].name).toBe("Pasta e zucchine");
    expect(ideas[0].reason).toContain("Usa zucchine, che hai in casa");
  });

  it("allontana un piatto mangiato nei giorni vicini", () => {
    const own = [memory("Pasta al pomodoro"), memory("Pasta e zucchine")];
    const ideas = suggestMeals(data({ memory: own, meals: [meal("2026-10-13", "dinner", "Pasta al pomodoro")] }), ctx());
    expect(ideas[0].name).toBe("Pasta e zucchine");
  });

  it("nel giorno di allenamento preferisce le proteine", () => {
    const own = [memory("Insalata"), memory("Tonno")];
    expect(suggestMeals(data({ memory: own }), ctx())[0].name).toBe("Insalata");
    const ideas = suggestMeals(data({ memory: own }), ctx({ signs: ["workout"] }));
    expect(ideas[0].name).toBe("Tonno");
    expect(ideas[0].reason).toContain("Proteine nel giorno di allenamento");
  });

  it("a pranzo in ufficio preferisce ciò che si prepara prima", () => {
    const own = [memory("Insalata"), memory("Verdure", { default_prep_mode: "to_prep" })];
    const ideas = suggestMeals(data({ memory: own }), ctx({ signs: ["office"] }));
    expect(ideas[0]).toMatchObject({ name: "Verdure", mode: "to_prep" });
    expect(ideas[0].reason).toContain("Si prepara prima, per il giorno in ufficio");
    expect(suggestMeals(data({ memory: own }), ctx({ signs: ["office"], slot: "dinner" }))).not.toContainEqual(expect.objectContaining({ reason: expect.stringContaining("ufficio") }));
  });

  it("è deterministico", () => {
    const d = data({ memory: [memory("Farro"), memory("Riso")] });
    expect(suggestMeals(d, ctx())).toEqual(suggestMeals(d, ctx()));
  });
});
