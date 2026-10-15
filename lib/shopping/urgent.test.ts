import { describe, expect, it } from "vitest";
import { classifyTask } from "../tasks/classify";
import { applyToShopping, applyToTasks } from "../sync/ops";
import type { ShoppingItem, Task } from "../supabase/types";
import {
  itemRenamedOps,
  itemsRemovedOps,
  itemsRestoredOps,
  itemToggledOps,
  setUrgentOps,
  shoppingTaskRemovedOps,
  shoppingTaskRestoredOps,
  shoppingTaskToggledOps,
  urgentTaskRow,
  urgentTaskTitle,
} from "./urgent";

const NOW = "2026-10-15T09:00:00.000Z";
const TODAY = "2026-10-15";

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: "i1",
    list_id: "l",
    name: "latte di soia",
    quantity: null,
    department: null,
    checked: false,
    checked_at: null,
    finished_at: null,
    urgent: false,
    task_id: null,
    deleted_at: null,
    created_at: NOW,
    ...over,
  };
}

describe("urgentTaskRow", () => {
  it("crea un'attività da fare entro dopodomani, con attenzione alta e collegata all'articolo", () => {
    expect(urgentTaskRow(item({ name: " tofu " }), "t1", TODAY)).toEqual({
      id: "t1",
      title: "Comprare tofu",
      window_start: "2026-10-15",
      due_date: "2026-10-17",
      attention: "high",
      source: "shopping",
      shopping_item_id: "i1",
    });
  });

  it("compare in Today da subito e il giorno della scadenza è tra le cose da fare", () => {
    const [task] = applyToTasks([], { kind: "insert", table: "tasks", row: urgentTaskRow(item(), "t1", TODAY) }, NOW);
    expect(classifyTask(task, TODAY, TODAY)).toBe("window");
    expect(classifyTask(task, "2026-10-16", "2026-10-16")).toBe("todo");
    expect(classifyTask(task, "2026-10-17", "2026-10-17")).toBe("todo");
    expect(classifyTask(task, "2026-10-18", "2026-10-18")).toBe("overdue");
  });
});

describe("setUrgentOps", () => {
  it("segnare urgente crea l'attività e la collega all'articolo", () => {
    const ops = setUrgentOps(item(), true, "t1", TODAY, NOW);
    expect(ops.map((o) => [o.kind, o.table])).toEqual([
      ["insert", "tasks"],
      ["update", "shopping_items"],
    ]);
    const items = ops.reduce((acc, op) => applyToShopping(acc, op, NOW), [item()]);
    expect(items[0]).toMatchObject({ urgent: true, task_id: "t1" });
  });

  it("togliere l'urgenza elimina l'attività solo se è ancora da fare", () => {
    const ops = setUrgentOps(item({ urgent: true, task_id: "t1" }), false, "t2", TODAY, NOW);
    expect(ops[0]).toMatchObject({ table: "shopping_items", patch: { urgent: false, task_id: null } });
    expect(ops[1]).toMatchObject({
      table: "tasks",
      patch: { deleted_at: NOW },
      where: [
        ["id", "eq", "t1"],
        ["status", "eq", "open"],
      ],
    });
  });

  it("non fa nulla se l'urgenza non cambia", () => {
    expect(setUrgentOps(item(), false, "t1", TODAY, NOW)).toEqual([]);
    expect(setUrgentOps(item({ urgent: true, task_id: "t1" }), true, "t2", TODAY, NOW)).toEqual([]);
  });

  it("un articolo già nel carrello si segna senza creare attività", () => {
    const ops = setUrgentOps(item({ checked: true }), true, "t1", TODAY, NOW);
    expect(ops).toEqual([{ kind: "update", table: "shopping_items", patch: { urgent: true }, where: [["id", "eq", "i1"]] }]);
  });
});

describe("articolo → attività", () => {
  it("spuntare completa l'attività, togliere la spunta la rimette da fare", () => {
    const urgent = item({ urgent: true, task_id: "t1" });
    expect(itemToggledOps(urgent, true, NOW)[0]).toMatchObject({ table: "tasks", patch: { status: "done", completed_at: NOW } });
    expect(itemToggledOps(urgent, false, NOW)[0]).toMatchObject({ table: "tasks", patch: { status: "open", completed_at: null } });
    expect(itemToggledOps(item(), true, NOW)).toEqual([]);
  });

  it("eliminare toglie le attività ancora da fare, annullare le rimette", () => {
    const items = [item({ task_id: "t1" }), item({ id: "i2" })];
    expect(itemsRemovedOps(items, NOW)).toHaveLength(1);
    const [restore] = itemsRestoredOps(items);
    expect(restore).toMatchObject({ table: "tasks", patch: { deleted_at: null } });
    expect(restore.kind === "update" && restore.where).toContainEqual(["status", "eq", "open"]);
  });

  it("rinominare cambia il titolo dell'attività", () => {
    expect(itemRenamedOps(item({ task_id: "t1" }), "tofu")[0]).toMatchObject({ table: "tasks", patch: { title: urgentTaskTitle("tofu") } });
    expect(itemRenamedOps(item(), "tofu")).toEqual([]);
  });
});

describe("attività → articolo", () => {
  const task: Pick<Task, "id" | "source" | "shopping_item_id"> = { id: "t1", source: "shopping", shopping_item_id: "i1" };

  it("completata in Today: l'articolo va nel carrello", () => {
    const start = [item({ urgent: true, task_id: "t1" })];
    const done = shoppingTaskToggledOps(task, true, NOW).reduce((acc, op) => applyToShopping(acc, op, NOW), start);
    expect(done[0]).toMatchObject({ checked: true, checked_at: NOW });
    const open = shoppingTaskToggledOps(task, false, NOW).reduce((acc, op) => applyToShopping(acc, op, NOW), done);
    expect(open[0]).toMatchObject({ checked: false, checked_at: null });
  });

  it("eliminata in Today: l'articolo resta in lista non più urgente; annulla lo rimette urgente", () => {
    const start = [item({ urgent: true, task_id: "t1" })];
    const removed = shoppingTaskRemovedOps(task).reduce((acc, op) => applyToShopping(acc, op, NOW), start);
    expect(removed[0]).toMatchObject({ urgent: false, task_id: null, deleted_at: null });
    const restored = shoppingTaskRestoredOps(task).reduce((acc, op) => applyToShopping(acc, op, NOW), removed);
    expect(restored[0]).toMatchObject({ urgent: true, task_id: "t1" });
  });

  it("le altre attività non toccano la Spesa", () => {
    const other = { id: "t2", source: "manual" as const, shopping_item_id: null };
    expect(shoppingTaskToggledOps(other, true, NOW)).toEqual([]);
    expect(shoppingTaskRemovedOps(other)).toEqual([]);
    expect(shoppingTaskRestoredOps(other)).toEqual([]);
  });
});
