import { describe, expect, it } from "vitest";
import { weekStart } from "../dates/local";
import type { MealMemory, MealPlan, PrepMode, Task } from "../supabase/types";
import { applyToMealMemory, applyToMeals, applyToTasks, type Op } from "../sync/ops";
import {
  addMealOps,
  hideIdeaOp,
  mealDot,
  mealFoods,
  mealTitle,
  normalizeMealName,
  rememberMealOp,
  reminderDate,
  reminderHint,
  reminderRemovedOps,
  reminderRestoredOps,
  reminderSchedule,
  reminderTitle,
  reminderToggledOps,
  removeMealOps,
  renameMealOps,
  setCondimentsOps,
  setEatenOutOps,
  setModeOps,
  setNutrientsOps,
  setPreparedOps,
  snoozeIdeaOp,
  suggestionsFor,
} from "./rules";

const TODAY = "2026-10-10"; // sabato
const NOW = "2026-10-10T09:00:00.000Z";
/** Le 11 a Roma, nello stesso istante di NOW. */
const CLOCK = { today: TODAY, time: "11:00" };

/** Lo stato come lo vedrebbe l'app: pasti della settimana e attività, dopo una serie di operazioni. */
type World = { meals: MealPlan[]; tasks: Task[] };

function run(world: World, ops: Op[]): World {
  return ops.reduce<World>(
    (w, op) => ({ meals: applyToMeals(w.meals, op, "2026-10-05", "2026-10-18"), tasks: applyToTasks(w.tasks, op, NOW) }),
    world,
  );
}

function withMeal(mode: PrepMode, date = "2026-10-12"): World {
  return run({ meals: [], tasks: [] }, addMealOps({ id: "m", date, slot: "lunch", name: "Riso e lenticchie", prep_mode: mode }, "t1", CLOCK));
}

describe("date e nomi", () => {
  it("la settimana parte dal lunedì", () => {
    expect(weekStart("2026-10-10")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("si prepara il giorno prima; un pasto di oggi, oggi stesso; uno passato, mai", () => {
    expect(reminderDate("2026-10-12", TODAY)).toBe("2026-10-11");
    expect(reminderDate("2026-10-11", TODAY)).toBe("2026-10-10");
    expect(reminderDate("2026-10-10", TODAY)).toBe("2026-10-10");
    expect(reminderDate("2026-10-08", TODAY)).toBeNull();
  });

  it("pasto di domani: il promemoria resta oggi, il giorno prima, all'orario dei pasti", () => {
    expect(reminderSchedule("2026-10-11", "lunch", CLOCK)).toEqual({ date: "2026-10-10", time: null });
    // Anche a sera tardi: l'orario lo decide l'avviso dei pasti, come prima.
    expect(reminderSchedule("2026-10-11", "breakfast", { today: TODAY, time: "23:30" })).toEqual({ date: "2026-10-10", time: null });
    expect(reminderSchedule("2026-10-14", "dinner", CLOCK)).toEqual({ date: "2026-10-13", time: null });
  });

  it("pasto di oggi con l'orario ancora lontano: oggi, un'ora circa prima", () => {
    expect(reminderSchedule(TODAY, "dinner", CLOCK)).toEqual({ date: TODAY, time: "19:00" });
    expect(reminderSchedule(TODAY, "snack", CLOCK)).toEqual({ date: TODAY, time: "15:30" });
    expect(reminderSchedule(TODAY, "lunch", { today: TODAY, time: "07:15" })).toEqual({ date: TODAY, time: "12:00" });
    expect(reminderSchedule(TODAY, "breakfast", { today: TODAY, time: "06:40" })).toEqual({ date: TODAY, time: "07:30" });
  });

  it("pasto di oggi con l'orario quasi raggiunto, o già passato: al prossimo quarto d'ora, mai nel passato", () => {
    expect(reminderSchedule(TODAY, "lunch", { today: TODAY, time: "12:00" })).toEqual({ date: TODAY, time: "12:15" });
    expect(reminderSchedule(TODAY, "lunch", { today: TODAY, time: "12:40" })).toEqual({ date: TODAY, time: "12:45" });
    expect(reminderSchedule(TODAY, "breakfast", CLOCK)).toEqual({ date: TODAY, time: "11:15" });
    expect(reminderSchedule(TODAY, "dinner", { today: TODAY, time: "21:59" })).toEqual({ date: TODAY, time: "22:00" });
    expect(reminderSchedule(TODAY, "dinner", { today: TODAY, time: "23:50" })).toEqual({ date: TODAY, time: "23:59" });
  });

  it("la riga sotto il pasto dice il giorno, e oggi stesso l'orario", () => {
    expect(reminderHint("2026-10-11", TODAY)).toBe("Promemoria in Oggi: domani");
    expect(reminderHint(TODAY, TODAY, "12:00:00")).toBe("Promemoria in Oggi alle 12:00");
    expect(reminderHint(TODAY, TODAY, "19:00")).toBe("Promemoria in Oggi alle 19:00");
    // Attività senza orario (nata ieri per il pasto di domani): niente "oggi" ripetuto.
    expect(reminderHint(TODAY, TODAY, null)).toBe("Promemoria in Oggi");
  });

  it("pasto di un giorno passato: nessun promemoria", () => {
    expect(reminderSchedule("2026-10-09", "dinner", CLOCK)).toBeNull();
  });

  it("il titolo dell'attività nomina il momento", () => {
    expect(reminderTitle("lunch")).toBe("Preparare il pranzo di domani");
    expect(reminderTitle("breakfast")).toBe("Preparare la colazione di domani");
    expect(reminderTitle("snack")).toBe("Preparare la merenda di domani");
    expect(reminderTitle("dinner")).toBe("Preparare la cena di domani");
    expect(reminderTitle("dinner", true)).toBe("Preparare la cena di oggi");
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

  it("un pasto di domani ha l'attività oggi, senza orario", () => {
    const { tasks } = withMeal("to_prep", "2026-10-11");
    expect(tasks[0]).toMatchObject({ title: "Preparare il pranzo di domani", date: TODAY, time: null });
  });

  it("un pasto di oggi non resta senza promemoria: l'attività è oggi, con un orario prima del pasto", () => {
    const { meals, tasks } = withMeal("to_prep", TODAY);
    expect(meals[0]).toMatchObject({ prep_mode: "to_prep", reminder_task_id: "t1" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Preparare il pranzo di oggi", notes: "Riso e lenticchie", date: TODAY, time: "12:00", source: "meal", meal_plan_id: "m" });
  });

  it("passare a Da preparare un pasto di oggi crea anche l'attività di oggi", () => {
    let w = withMeal("ready", TODAY);
    w = run(w, setModeOps(w.meals[0], "to_prep", "t2", { today: TODAY, time: "12:20" }, NOW));
    expect(w.tasks).toHaveLength(1);
    expect(w.tasks[0]).toMatchObject({ id: "t2", date: TODAY, time: "12:30" });
  });

  it("i pasti dei giorni passati non generano attività", () => {
    const { meals, tasks } = withMeal("to_prep", "2026-10-08");
    expect(tasks).toEqual([]);
    expect(meals[0]).toMatchObject({ prep_mode: "to_prep", reminder_task_id: null });
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

  it("segnare un pasto come mangiato fuori elimina l'attività e lo rende Pronto; toglierlo non la ricrea", () => {
    let w = withMeal("to_prep");
    w = run(w, setEatenOutOps(w.meals[0], true, NOW));
    expect(w.tasks).toEqual([]);
    expect(w.meals[0]).toMatchObject({ eaten_out: true, prep_mode: "ready", prepared: false, reminder_task_id: null });
    expect(setEatenOutOps(w.meals[0], true, NOW)).toEqual([]);
    w = run(w, setEatenOutOps(w.meals[0], false, NOW));
    expect(w.tasks).toEqual([]);
    expect(w.meals[0]).toMatchObject({ eaten_out: false, prep_mode: "ready", name: "Riso e lenticchie" });
  });

  it("i condimenti restano fuori dal titolo e dall'attività, ma dicono cosa si è mangiato", () => {
    let w = run({ meals: [], tasks: [] }, addMealOps({ id: "c", date: "2026-10-12", slot: "lunch", name: "Farro, broccoli e tofu", prep_mode: "to_prep", condiments: "olio, limone" }, "t2", CLOCK));
    expect(w.meals[0]).toMatchObject({ name: "Farro, broccoli e tofu", condiments: "olio, limone" });
    expect(mealTitle(w.meals[0])).toBe("Farro, broccoli e tofu");
    expect(mealFoods(w.meals[0])).toBe("Farro, broccoli e tofu, olio, limone");
    expect(w.tasks[0].notes).toBe("Farro, broccoli e tofu");
    expect(setCondimentsOps(w.meals[0], "olio, limone")).toEqual([]);
    w = run(w, setCondimentsOps(w.meals[0], ""));
    expect(w.meals[0].condiments).toBe("");
    expect(w.tasks[0].notes).toBe("Farro, broccoli e tofu");
  });

  it("un pasto senza condimenti li ha vuoti", () => {
    expect(withMeal("ready").meals[0].condiments).toBe("");
  });

  it("un pasto fuori può nascere senza nome, e si legge comunque", () => {
    const w = run({ meals: [], tasks: [] }, addMealOps({ id: "o", date: "2026-10-12", slot: "dinner", name: "", prep_mode: "ready", eaten_out: true }, "t9", CLOCK));
    expect(w.tasks).toEqual([]);
    expect(w.meals[0]).toMatchObject({ eaten_out: true, name: "" });
    expect(mealTitle(w.meals[0])).toBe("Mangiato fuori");
    expect(mealTitle({ name: "Pizza", eaten_out: true })).toBe("Pizza");
    expect(withMeal("ready").meals[0].eaten_out).toBe(false);
  });

  it("passare a Pronto elimina l'attività e azzera Preparato", () => {
    let w = withMeal("to_prep");
    w = run(w, setPreparedOps(w.meals[0], true, NOW));
    w = run(w, setModeOps(w.meals[0], "ready", "t2", CLOCK, NOW));
    expect(w.tasks).toEqual([]);
    expect(w.meals[0]).toMatchObject({ prep_mode: "ready", prepared: false, reminder_task_id: null });
  });

  it("tornare a Da preparare crea una nuova attività", () => {
    let w = withMeal("ready");
    w = run(w, setModeOps(w.meals[0], "to_prep", "t2", CLOCK, NOW));
    expect(w.meals[0]).toMatchObject({ prep_mode: "to_prep", reminder_task_id: "t2" });
    expect(w.tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("scegliere la modalità che c'è già non fa nulla", () => {
    const w = withMeal("to_prep");
    expect(setModeOps(w.meals[0], "to_prep", "t2", CLOCK, NOW)).toEqual([]);
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
    w = run(w, setModeOps(w.meals[0], "ready", "t2", CLOCK, NOW));
    w = run(w, setModeOps(w.meals[0], "to_prep", "t2", CLOCK, NOW));
    w = run(w, reminderRemovedOps(old));
    expect(w.meals[0].reminder_task_id).toBe("t2");
  });
});

describe("modifiche fatte offline e inviate dopo", () => {
  it("una fila di modifiche in attesa porta allo stesso stato finale, anche riapplicata sui dati del server", () => {
    const queue: Op[] = [];
    let local = withMeal("to_prep");
    queue.push(...addMealOps({ id: "m", date: "2026-10-12", slot: "lunch", name: "Riso e lenticchie", prep_mode: "to_prep" }, "t1", CLOCK));
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
    nutrients: null,
    hidden_at: null,
  snoozed_until: null,
    ...over,
  });

  it("la prima volta nasce con un uso, poi cresce e ricorda l'ultima modalità", () => {
    const first = applyToMealMemory([], rememberMealOp("id1", "lunch", "Riso e Lenticchie", "to_prep", undefined, NOW));
    expect(first[0]).toMatchObject({ name_normalized: "riso e lenticchie", display_name: "Riso e Lenticchie", use_count: 1, default_prep_mode: "to_prep" });
    const second = applyToMealMemory(first, rememberMealOp("id1", "lunch", "riso e lenticchie", "ready", first[0], NOW));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ use_count: 2, default_prep_mode: "ready" });
  });

  it("corregge i nutrienti su tutte le righe con lo stesso nome, senza contare un uso", () => {
    const list = [memory({ id: "a", name_normalized: "avanzi" }), memory({ id: "b", slot: "dinner", name_normalized: "avanzi", use_count: 3 }), memory({ id: "c", name_normalized: "riso" })];
    const after = setNutrientsOps(list, "a", "lunch", "Avanzi", "ready", ["protein"]).reduce(applyToMealMemory, list);
    expect(after.map((m) => [m.id, m.nutrients, m.use_count])).toEqual([["a", ["protein"], 1], ["b", ["protein"], 3], ["c", null, 1]]);
  });

  it("corregge i nutrienti anche di un piatto che la memoria non conosce ancora: non diventa un ricorrente", () => {
    const after = setNutrientsOps([], "new", "lunch", "Avanzi", "to_prep", ["fiber"]).reduce(applyToMealMemory, [] as MealMemory[]);
    expect(after[0]).toMatchObject({ id: "new", name_normalized: "avanzi", nutrients: ["fiber"], use_count: 0, hidden_at: null, snoozed_until: null });
    expect(suggestionsFor(after, "lunch")).toEqual([]);
  });

  it("ricordare un piatto lascia stare la correzione dei nutrienti, se non ne arriva una nuova", () => {
    const list = [memory({ id: "a", name_normalized: "avanzi", nutrients: ["protein"] })];
    const again = applyToMealMemory(list, rememberMealOp("a", "lunch", "Avanzi", "ready", list[0], NOW));
    expect(again[0]).toMatchObject({ nutrients: ["protein"], use_count: 2 });
    const reset = applyToMealMemory(again, rememberMealOp("a", "lunch", "Avanzi", "ready", again[0], NOW, null));
    expect(reset[0].nutrients).toBeNull();
  });

  it("nasconde un'idea e la rimette; metterla a mano la fa tornare", () => {
    const hidden = applyToMealMemory([], hideIdeaOp("id1", "lunch", "Pasta e ceci", "to_prep", undefined, NOW));
    expect(hidden[0]).toMatchObject({ hidden_at: NOW, use_count: 0, default_prep_mode: "to_prep" });
    expect(applyToMealMemory(hidden, hideIdeaOp("id1", "lunch", "Pasta e ceci", "to_prep", hidden[0], null))[0].hidden_at).toBeNull();
    expect(applyToMealMemory(hidden, rememberMealOp("id1", "lunch", "Pasta e ceci", "ready", hidden[0], NOW))[0]).toMatchObject({ hidden_at: null, use_count: 1 });
  });

  it("\"Meno spesso\" segna il giorno fino a cui non proporre; rimettere il piatto a mano lo toglie", () => {
    const snoozed = applyToMealMemory([], snoozeIdeaOp("id1", "lunch", "Pasta e ceci", "to_prep", undefined, "2026-10-31"));
    expect(snoozed[0]).toMatchObject({ use_count: 0, snoozed_until: "2026-10-31", hidden_at: null });
    expect(applyToMealMemory(snoozed, snoozeIdeaOp("id1", "lunch", "Pasta e ceci", "to_prep", snoozed[0], null))[0].snoozed_until).toBeNull();
    expect(applyToMealMemory(snoozed, rememberMealOp("id1", "lunch", "Pasta e ceci", "to_prep", snoozed[0], NOW))[0]).toMatchObject({ use_count: 1, snoozed_until: null });
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
