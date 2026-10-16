import { describe, expect, it } from "vitest";
import type { MealPlan, MealSlot } from "../supabase/types";
import { addIngredient, ingredientsIn, mealsUsing } from "./ingredients";

const pantry = (...names: string[]) => names.map((name) => ({ name }));
const names = (found: { name: string }[]) => found.map((f) => f.name);

function meal(name: string, date: string, slot: MealSlot = "dinner", condiments = ""): MealPlan {
  return { id: `${date}-${slot}`, date, slot, name, prep_mode: "ready", eaten_out: false, condiments, prepared: false, prepared_at: null, reminder_task_id: null };
}

describe("ingredienti nominati in un pasto", () => {
  it("riconosce gli ingredienti nel nome", () => {
    expect(names(ingredientsIn("Patate e fagiolini", pantry("Patate", "Fagiolini", "Carote")))).toEqual(["Patate", "Fagiolini"]);
  });

  it("singolare e plurale coincidono", () => {
    expect(names(ingredientsIn("Frittata di patate", pantry("Patata", "Uova")))).toEqual(["Patata"]);
    expect(names(ingredientsIn("Uovo sodo", pantry("Uova")))).toEqual(["Uova"]);
    expect(names(ingredientsIn("Risotto ai funghi e finocchi", pantry("Fungo", "Finocchio")))).toEqual(["Fungo", "Finocchio"]);
    expect(names(ingredientsIn("Pesche sciroppate", pantry("Pesca")))).toEqual(["Pesca"]);
  });

  it("ignora maiuscole e accenti", () => {
    expect(names(ingredientsIn("CAFFÈ e biscotti", pantry("caffe")))).toEqual(["caffe"]);
  });

  it("conta la parola principale dell'ingrediente", () => {
    expect(names(ingredientsIn("Yogurt e frutta", pantry("Yogurt greco", "Passata di pomodoro")))).toEqual(["Yogurt greco"]);
    expect(names(ingredientsIn("Pasta al pomodoro", pantry("Passata di pomodoro")))).toEqual([]);
  });

  it("confronta parole intere, non pezzi", () => {
    expect(names(ingredientsIn("Risotto", pantry("Riso")))).toEqual([]);
    expect(names(ingredientsIn("Pasta all'uovo", pantry("Uova", "Pasta")))).toEqual(["Uova", "Pasta"]);
  });

  it("un nome fatto solo di parole vuote non corrisponde a nulla", () => {
    expect(names(ingredientsIn("Pane e olio", pantry("e", "")))).toEqual([]);
  });
});

describe("pasti che usano un ingrediente", () => {
  const meals = [
    meal("Patate al forno", "2026-10-14"),
    meal("Gnocchi di patate", "2026-10-12", "lunch"),
    meal("Patate lesse", "2026-10-12", "dinner"),
    meal("Purè di patate", "2026-10-10"),
    meal("Riso e lenticchie", "2026-10-13"),
  ];

  it("solo da oggi in poi, dal più vicino", () => {
    expect(mealsUsing("Patate", meals, "2026-10-11").map((m) => m.name)).toEqual(["Gnocchi di patate", "Patate lesse", "Patate al forno"]);
  });

  it("anche nei condimenti", () => {
    const withOil = [meal("Farro e broccoli", "2026-10-12", "lunch", "olio, limone"), meal("Pasta al pomodoro", "2026-10-13")];
    expect(mealsUsing("Limoni", withOil, "2026-10-11").map((m) => m.name)).toEqual(["Farro e broccoli"]);
  });

  it("nessuno se non è nominato", () => {
    expect(mealsUsing("Carote", meals, "2026-10-11")).toEqual([]);
  });
});

describe("comporre il nome con gli ingredienti", () => {
  it("il primo fa da nome", () => {
    expect(addIngredient("", "patate")).toBe("Patate");
  });

  it("il secondo si unisce con «e»", () => {
    expect(addIngredient("Patate", "Fagiolini")).toBe("Patate e fagiolini");
  });

  it("dal terzo l'elenco prende le virgole", () => {
    expect(addIngredient("Patate e fagiolini ", "Carote")).toBe("Patate, fagiolini e carote");
  });
});
