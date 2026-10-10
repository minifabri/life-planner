import { describe, expect, it } from "vitest";
import { weekStart } from "../dates/local";
import type { MealMemory, MealPlan, PrepMode, Task } from "../supabase/types";
import { applyToMealMemory, applyToMeals, applyToTasks, type Op } from "../sync/ops";
import {
  addMealOps,
  mealDot,
  normalizeMealName,
  rememberMealOp,
  reminderDate,
  reminderRemovedOps,
  reminderRestoredOps,
  reminderTitle,
  reminderToggledOps,
  removeMealOps,
  renameMealOps,
  setModeOps,
  setPreparedOps,
  suggestionsFor,
} from "./rules";

const TODAY = "2026-10-10"; // sabato
const NOW = "2026-10-10T09:00:00.000Z";

/** Lo stato come lo vedrebbe l'app: pasti della settimana e attività, dopo una serie di operazioni. */
type World = { meals: MealPlan[]; tasks: Task[] };

function run(world: World, ops: Op[]): World {
  return ops.reduce<World>(
    (w, op) => ({ meals: applyToMeals(w.meals, op, "2026-10-05", "2026-10-18"), tasks: applyToTasks(w.tasks, op, NOW) }),
    world,
  );
}

function withMeal(mode: PrepMode, date = "2026-10-12"): World {
  return run({ meals: [], tasks: [] }, addMealOps({ id: "m", date, slot: "lunch", name: "Riso e lenticchie", prep_mode: mode }, "t1", TODAY));
}

describe("date e nomi", () => {
  it("la settimana parte dal lunedì", () => {
    expect(weekStart("2026-10-10")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("si prepara il giorno prima, se non è già passato", () => {
    expect(reminderDate("2026-10-12", TODAY)).toBe("2026-10-11");
    expect(reminderDate("2026-10-11", TODAY)).toBe("2026-10-10");
    expect(reminderDate("2026-10-10", TODAY)).toBeNull();
    expect(reminderDate("2026-10-08", TODAY)).toBeNull();
  });

  it("il titolo dell'attività nomina il momento", () => {
    expect(reminderTitle("lunch")).toBe("Preparare il pranzo di domani");
    expect(reminderTitle("breakfast")).toBe("Preparare la colazione di domani");
    expect(reminderTitle("snack")).toBe("Preparare la merenda di domani");
    expect(reminderTitle("dinner")).toBe("Preparare la cena di domani");
  });

  it("riconosce lo stesso piatto scritto in modi diversi", () => {
    expect(normalizeMealName("  Pasta  al Ragù ")).toBe("pasta al ragu");
    expect(normalizeMealName("PASTA AL RAGU")).toBe("pasta al ragu");
  });
});

describe("pasto → attività", () => {
  it("un pasto da preparare crea l'attività il giorno prima, con il piatto nelle note", () => {
    const { meals, tasks } = withMeal("to_prep");
    expect(meals[0]).toMatchObject({ prep_mode: "to_prep", prepared: false, reminder_task_id: "t1" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "t1",
      title: "Preparare il pranzo di domani",
      notes: "Riso e lenticchie",
      date: "2026-10-11",
      source: "meal",
      meal_plan_id: "m",
      status: "open",
    });
  });

  it("un pasto pronto non crea attività", () => {
    const { meals, tasks } = withMeal("ready");
    expect(tasks).toEqual([]);
    expect(meals[0].reminder_task_id).toBeNull();
  });

  it("i pasti di oggi e dei giorni passati non generano attività", () => {
    for (const date of [TODAY, "2026-10-08"]) {
      const { meals, tasks } = withMeal("to_prep", date);
      expect(tasks).toEqual([]);
      expect(meals[0]).toMatchObject({ prep_mode: "to_prep", reminder_task_id: null });
    }
  });

  it("segnare Preparato dal planner completa l'attività; toglierlo la riapre", () => {
    let w = withMeal("to_prep");
    w = run(w, setPreparedOps(w.meals[0], true, NOW));
    expect(w.meals[0]).toMatchObject({ prepared: true, prepared_at: NOW });
    expect(w.tasks[0]).toMatchObject({ status: "done", completed_at: NOW });
    w = run(w, setPreparedOps(w.meals[0], false, NOW));
    expect(w.meals[0]).toMatchObject({ prepared: false, prepared_at: null });
    expect(w.tasks[0]).toMatchObject({ status: "open", completed_at: null });
  });

  it("passare a Pronto elimina l'attività e azzera Preparato", () => {
    let w = withMeal("to_prep");
    w = run(w, setPreparedOps(w.meals[0], true, NOW));
    w = run(w, setModeOps(w.meals[0], "ready", "t2", TODAY, NOW));
    expect(w.tasks).toEqual([]);
    expect(w.meals[0]).toMatchObject({ prep_mode: "ready", prepared: false, reminder_task_id: null });
  });

  it("tornare a Da preparare crea una nuova attività", () => {
    let w = withMeal("ready");
    w = run(w, setModeOps(w.meals[0], "to_prep", "t2", TODAY, NOW));
    expect(w.meals[0]).toMatchObject({ prep_mode: "to_prep", reminder_task_id: "t2" });
    expect(w.tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("scegliere la modalità che c'è già non fa nulla", () => {
    const w = withMeal("to_prep");
    expect(setModeOps(w.meals[0], "to_prep", "t2", TODAY, NOW)).toEqual([]);
  });

  it("cambiare piatto aggiorna le note dell'attività", () => {
    let w = withMeal("to_prep");
    w = run(w, renameMealOps(w.meals[0], "Farro e ceci"));
    expect(w.meals[0].name).toBe("Farro e ceci");
    expect(w.tasks[0].notes).toBe("Farro e ceci");
  });

  it("eliminare il pasto elimina anche l'attività", () => {
    let w = withMeal("to_prep");
    w = run(w, removeMealOps(w.meals[0], NOW));
    expect(w).toEqual({ meals: [], tasks: [] });
  });
});

describe("attività → pasto", () => {
  it("spuntare l'attività segna il pasto come preparato; rimetterla da fare lo toglie", () => {
    let w = withMeal("to_prep");
    w = run(w, reminderToggledOps(w.tasks[0], true, NOW));
    expect(w.meals[0]).toMatchObject({ prepared: true, prepared_at: NOW });
    w = run(w, reminderToggledOps(w.tasks[0], false, NOW));
    expect(w.meals[0]).toMatchObject({ prepared: false, prepared_at: null });
  });

  it("eliminare l'attività toglie solo il promemoria: il pasto resta da preparare", () => {
    let w = withMeal("to_prep");
    w = run(w, reminderRemovedOps(w.tasks[0]));
    expect(w.meals[0]).toMatchObject({ prep_mode: "to_prep", prepared: false, reminder_task_id: null });
  });

  it("annullare l'eliminazione ricollega il promemoria al pasto", () => {
    let w = withMeal("to_prep");
    const reminder = w.tasks[0];
    w = run(w, reminderRemovedOps(reminder));
    w = run(w, reminderRestoredOps(reminder));
    expect(w.meals[0].reminder_task_id).toBe(reminder.id);
  });

  it("dopo l'eliminazione, segnare Preparato non ricrea né tocca alcuna attività", () => {
    let w = withMeal("to_prep");
    w = run(w, reminderRemovedOps(w.tasks[0]));
    const ops = setPreparedOps(w.meals[0], true, NOW);
    expect(ops.map((o) => o.table)).toEqual(["meal_plans"]);
  });

  it("un'attività qualsiasi non tocca i pasti", () => {
    const plain = { id: "x", source: "manual" as const, meal_plan_id: null };
    expect(reminderToggledOps(plain, true, NOW)).toEqual([]);
    expect(reminderRemovedOps(plain)).toEqual([]);
  });

  it("l'eliminazione di un'attività vecchia non scollega quella nuova", () => {
    let w = withMeal("to_prep");
    const old = w.tasks[0];
    w = run(w, setModeOps(w.meals[0], "ready", "t2", TODAY, NOW));
    w = run(w, setModeOps(w.meals[0], "to_prep", "t2", TODAY, NOW));
    w = run(w, reminderRemovedOps(old));
    expect(w.meals[0].reminder_task_id).toBe("t2");
  });
});

describe("modifiche fatte offline e inviate dopo", () => {
  it("una fila di modifiche in attesa porta allo stesso stato finale, anche riapplicata sui dati del server", () => {
    const queue: Op[] = [];
    let local = withMeal("to_prep");
    queue.push(...addMealOps({ id: "m", date: "2026-10-12", slot: "lunch", name: "Riso e lenticchie", prep_mode: "to_prep" }, "t1", TODAY));
    for (const step of [
      (w: World) => reminderToggledOps(w.tasks[0], true, NOW),
      (w: World) => renameMealOps(w.meals[0], "Farro e ceci"),
      (w: World) => setPreparedOps(w.meals[0], false, NOW),
    ]) {
      const ops = step(local);
      queue.push(...ops);
      local = run(local, ops);
    }
    // Il server non ha ancora nulla: la coda riapplicata da zero dà ciò che l'app sta mostrando.
    expect(run({ meals: [], tasks: [] }, queue)).toEqual(local);
    // Il server ha già ricevuto metà della coda: riapplicarla tutta non cambia il risultato.
    const half = run({ meals: [], tasks: [] }, queue.slice(0, 4));
    expect(run(half, queue)).toEqual(local);
    expect(local.meals[0]).toMatchObject({ name: "Farro e ceci", prepared: false, reminder_task_id: "t1" });
    expect(local.tasks[0]).toMatchObject({ status: "open", notes: "Farro e ceci" });
  });
});

describe("ricorrenti", () => {
  const memory = (over: Partial<MealMemory>): MealMemory => ({
    id: "x",
    slot: "lunch",
    name_normalized: "x",
    display_name: "X",
    default_prep_mode: "ready",
    use_count: 1,
    last_used_at: null,
    ...over,
  });

  it("la prima volta nasce con un uso, poi cresce e ricorda l'ultima modalità", () => {
    const first = applyToMealMemory([], rememberMealOp("id1", "lunch", "Riso e Lenticchie", "to_prep", undefined, NOW));
    expect(first[0]).toMatchObject({ name_normalized: "riso e lenticchie", display_name: "Riso e Lenticchie", use_count: 1, default_prep_mode: "to_prep" });
    const second = applyToMealMemory(first, rememberMealOp("id1", "lunch", "riso e lenticchie", "ready", first[0], NOW));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ use_count: 2, default_prep_mode: "ready" });
  });

  it("suggerisce solo quelli del momento, dal più usato; a parità il più recente", () => {
    const list = [
      memory({ id: "a", display_name: "Insalata", use_count: 2, last_used_at: "2026-10-01T00:00:00Z" }),
      memory({ id: "b", display_name: "Riso", use_count: 5 }),
      memory({ id: "c", display_name: "Yogurt", slot: "breakfast", use_count: 9 }),
      memory({ id: "d", display_name: "Farro", use_count: 2, last_used_at: "2026-10-08T00:00:00Z" }),
    ];
    expect(suggestionsFor(list, "lunch").map((m) => m.display_name)).toEqual(["Riso", "Farro", "Insalata"]);
  });
});

describe("mealDot", () => {
  it("vuoto, a posto, da preparare", () => {
    expect(mealDot(undefined)).toBe("empty");
    expect(mealDot({ prep_mode: "ready", prepared: false })).toBe("ok");
    expect(mealDot({ prep_mode: "to_prep", prepared: true })).toBe("ok");
    expect(mealDot({ prep_mode: "to_prep", prepared: false })).toBe("prep");
  });
});
