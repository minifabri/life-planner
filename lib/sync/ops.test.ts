import { describe, expect, it } from "vitest";
import type { EventRow, Task } from "../supabase/types";
import { applyToDayEvents, applyToPantry, applyToRecurrences, applyToShopping, applyToTasks, applyToWorkouts, byId, classifyStatus, eventTouchesDay, type DayEvents, type Op } from "./ops";

const AT = "2026-10-10T08:00:00.000Z";
const TZ = "Europe/Rome";
const DAY = "2026-10-10";

function task(over: Partial<Task> & { id: string }): Task {
  return applyToTasks([], { kind: "insert", table: "tasks", row: { title: "Attività", ...over } }, AT)[0];
}

function event(over: Partial<EventRow> & { id: string }): EventRow {
  const op: Op = { kind: "insert", table: "events", row: { title: "Evento", rrule: "FREQ=DAILY", ...over } };
  return applyToDayEvents({ events: [], exceptions: [] }, op, AT, DAY, TZ).events[0];
}

describe("applyToTasks", () => {
  it("aggiunge un'attività nuova con i valori che metterebbe il database", () => {
    const [t] = applyToTasks([], { kind: "insert", table: "tasks", row: { id: "a", title: "Latte", date: DAY } }, AT);
    expect(t).toMatchObject({ id: "a", title: "Latte", date: DAY, status: "open", attention: "low", source: "manual", created_at: AT });
    expect(t.deleted_at).toBeNull();
  });

  it("non duplica un'attività che il server ha già", () => {
    const existing = task({ id: "a", title: "Sul server" });
    const result = applyToTasks([existing], { kind: "insert", table: "tasks", row: { id: "a", title: "Locale" } }, AT);
    expect(result).toEqual([existing]);
  });

  it("applica una modifica alla riga giusta", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    const result = applyToTasks(tasks, { kind: "update", table: "tasks", patch: { status: "done" }, where: byId("b") }, AT);
    expect(result.map((t) => t.status)).toEqual(["open", "done"]);
  });

  it("toglie le attività eliminate", () => {
    const result = applyToTasks([task({ id: "a" })], { kind: "update", table: "tasks", patch: { deleted_at: AT }, where: byId("a") }, AT);
    expect(result).toEqual([]);
  });

  it("riporta in vista un'attività modificata che la vista non aveva", () => {
    const reopened = task({ id: "a", status: "open" });
    const op: Op = { kind: "update", table: "tasks", patch: { status: "open" }, where: byId("a"), snapshot: reopened };
    expect(applyToTasks([], op, AT)).toEqual([reopened]);
  });

  it("ferma una ricorrenza: elimina solo le occorrenze future ancora aperte", () => {
    const tasks = [
      task({ id: "oggi", recurrence_id: "r", date: "2026-10-10" }),
      task({ id: "futura", recurrence_id: "r", date: "2026-10-11" }),
      task({ id: "futura-fatta", recurrence_id: "r", date: "2026-10-12", status: "done" }),
      task({ id: "altra", recurrence_id: "x", date: "2026-10-12" }),
      task({ id: "senza-data", recurrence_id: "r" }),
    ];
    const op: Op = {
      kind: "update",
      table: "tasks",
      patch: { deleted_at: AT },
      where: [
        ["recurrence_id", "eq", "r"],
        ["status", "eq", "open"],
        ["date", "gt", "2026-10-10"],
      ],
    };
    expect(applyToTasks(tasks, op, AT).map((t) => t.id)).toEqual(["oggi", "futura-fatta", "altra", "senza-data"]);
  });

  it("annullare un completamento toglie l'attività successiva solo se è ancora aperta", () => {
    const op: Op = { kind: "delete", table: "tasks", where: [["id", "eq", "next"], ["status", "eq", "open"]] };
    expect(applyToTasks([task({ id: "next" })], op, AT)).toEqual([]);
    expect(applyToTasks([task({ id: "next", status: "done" })], op, AT)).toHaveLength(1);
  });

  it("ignora le modifiche ad altre tabelle", () => {
    const tasks = [task({ id: "a" })];
    expect(applyToTasks(tasks, { kind: "delete", table: "events", where: byId("a") }, AT)).toBe(tasks);
  });

  it("più modifiche in fila danno lo stato finale: crea, completa, rimetti da fare", () => {
    const ops: Op[] = [
      { kind: "insert", table: "tasks", row: { id: "a", title: "Bucato" } },
      { kind: "update", table: "tasks", patch: { status: "done", completed_at: AT }, where: byId("a") },
      { kind: "update", table: "tasks", patch: { status: "open", completed_at: null }, where: byId("a") },
    ];
    const [t] = ops.reduce((acc, op) => applyToTasks(acc, op, AT), [] as Task[]);
    expect(t).toMatchObject({ id: "a", status: "open", completed_at: null });
  });
});

describe("eventTouchesDay", () => {
  it("le serie toccano sempre il giorno", () => {
    expect(eventTouchesDay(event({ id: "e", rrule: "FREQ=WEEKLY" }), DAY, TZ)).toBe(true);
  });

  it("un evento con orario conta dalla settimana prima alla fine del giorno locale", () => {
    const at = (start_at: string) => ({ ...event({ id: "e" }), rrule: null, start_at });
    expect(eventTouchesDay(at("2026-10-10T21:30:00.000Z"), DAY, TZ)).toBe(true); // 23:30 a Roma
    expect(eventTouchesDay(at("2026-10-10T22:30:00.000Z"), DAY, TZ)).toBe(false); // 00:30 del giorno dopo
    expect(eventTouchesDay(at("2026-10-03T10:00:00.000Z"), DAY, TZ)).toBe(true);
    expect(eventTouchesDay(at("2026-10-02T10:00:00.000Z"), DAY, TZ)).toBe(false);
  });

  it("un evento di tutto il giorno conta se è iniziato entro 60 giorni", () => {
    const allDay = (start_date: string) => ({ ...event({ id: "e" }), rrule: null, all_day: true, start_date });
    expect(eventTouchesDay(allDay("2026-10-10"), DAY, TZ)).toBe(true);
    expect(eventTouchesDay(allDay("2026-10-11"), DAY, TZ)).toBe(false);
    expect(eventTouchesDay(allDay("2026-08-01"), DAY, TZ)).toBe(false);
  });
});

describe("applyToDayEvents", () => {
  const empty: DayEvents = { events: [], exceptions: [] };

  it("aggiunge un evento nuovo solo alle viste dei giorni che tocca", () => {
    const op: Op = { kind: "insert", table: "events", row: { id: "e", title: "Dentista", start_at: "2026-10-10T13:00:00.000Z" } };
    expect(applyToDayEvents(empty, op, AT, DAY, TZ).events).toHaveLength(1);
    expect(applyToDayEvents(empty, op, AT, "2026-10-09", TZ).events).toHaveLength(0);
  });

  it("sposta un evento da un giorno all'altro", () => {
    const before = { ...event({ id: "e" }), rrule: null, start_at: "2026-10-10T13:00:00.000Z" };
    const patch = { start_at: "2026-10-20T13:00:00.000Z" };
    const op: Op = { kind: "update", table: "events", patch, where: byId("e"), snapshot: { ...before, ...patch } };
    expect(applyToDayEvents({ events: [before], exceptions: [] }, op, AT, DAY, TZ).events).toHaveLength(0);
    expect(applyToDayEvents(empty, op, AT, "2026-10-20", TZ).events).toHaveLength(1);
  });

  it("toglie un evento eliminato", () => {
    const op: Op = { kind: "update", table: "events", patch: { deleted_at: AT }, where: byId("e") };
    expect(applyToDayEvents({ events: [event({ id: "e" })], exceptions: [] }, op, AT, DAY, TZ).events).toEqual([]);
  });

  it("cancella una sola occorrenza di una serie, senza doppioni se ripetuto", () => {
    const data: DayEvents = { events: [event({ id: "e" })], exceptions: [] };
    const cancel = (id: string): Op => ({
      kind: "insert",
      table: "event_exceptions",
      row: { id, event_id: "e", original_start: "2026-10-10T07:00:00.000Z", cancelled: true },
      onConflict: "event_id,original_start",
      merge: true,
    });
    const once = applyToDayEvents(data, cancel("x1"), AT, DAY, TZ);
    const twice = applyToDayEvents(once, cancel("x2"), AT, DAY, TZ);
    expect(twice.exceptions).toHaveLength(1);
    expect(twice.exceptions[0]).toMatchObject({ id: "x1", event_id: "e", cancelled: true });
  });

  it("ignora l'eccezione di una serie che la vista non contiene", () => {
    const op: Op = { kind: "insert", table: "event_exceptions", row: { id: "x", event_id: "altro", original_start: AT, cancelled: true } };
    expect(applyToDayEvents(empty, op, AT, DAY, TZ).exceptions).toEqual([]);
  });
});

describe("applyToRecurrences", () => {
  it("aggiunge e ferma una ricorrenza", () => {
    const created = applyToRecurrences([], {
      kind: "insert",
      table: "recurrences",
      row: { id: "r", kind: "after_completion", interval_days: 30, template: {} },
    });
    expect(created[0]).toMatchObject({ id: "r", active: true, until: null, interval_days: 30 });
    const stopped = applyToRecurrences(created, { kind: "update", table: "recurrences", patch: { active: false }, where: byId("r") });
    expect(stopped[0].active).toBe(false);
  });
});

describe("applyToShopping", () => {
  const add: Op = { kind: "insert", table: "shopping_items", row: { id: "s", list_id: "l", name: "Latte" } };

  it("aggiunge, spunta e toglie un articolo", () => {
    const added = applyToShopping([], add, AT);
    expect(added[0]).toMatchObject({ id: "s", name: "Latte", checked: false, quantity: null, created_at: AT });
    const checked = applyToShopping(added, { kind: "update", table: "shopping_items", patch: { checked: true, checked_at: AT }, where: byId("s") }, AT);
    expect(checked[0].checked).toBe(true);
    expect(applyToShopping(checked, { kind: "update", table: "shopping_items", patch: { deleted_at: AT }, where: byId("s") }, AT)).toEqual([]);
  });

  it("annullare un'eliminazione rimette l'articolo in lista", () => {
    const [item] = applyToShopping([], add, AT);
    const undo: Op = { kind: "update", table: "shopping_items", patch: { deleted_at: null }, where: byId("s"), snapshot: { ...item, deleted_at: null } };
    expect(applyToShopping([], undo, AT)).toEqual([item]);
  });
});

describe("applyToPantry", () => {
  const add: Op = { kind: "insert", table: "shopping_items", row: { id: "s", list_id: "l", name: "Latte" } };
  const [item] = applyToShopping([], add, AT);
  const bought = { ...item, checked: true, checked_at: AT };
  const update = (patch: Record<string, unknown>, snapshot?: typeof item): Op => ({ kind: "update", table: "shopping_items", patch, where: byId("s"), snapshot });

  it("un articolo entra quando viene spuntato e resta dopo \"Svuota completati\"", () => {
    expect(applyToPantry([], add, AT)).toEqual([]);
    const pantry = applyToPantry([], update({ checked: true, checked_at: AT }, bought), AT);
    expect(pantry).toEqual([bought]);
    expect(applyToPantry(pantry, update({ deleted_at: AT }), AT)).toHaveLength(1);
  });

  it("esce se la spunta viene tolta o se è finito, e torna annullando", () => {
    expect(applyToPantry([bought], update({ checked: false, checked_at: null }), AT)).toEqual([]);
    expect(applyToPantry([bought], update({ finished_at: AT }), AT)).toEqual([]);
    expect(applyToPantry([], update({ finished_at: null }, bought), AT)).toEqual([bought]);
  });
});

describe("classifyStatus", () => {
  it("una risposta positiva chiude la modifica", () => {
    expect(classifyStatus(201, false)).toBe("done");
    expect(classifyStatus(204, false)).toBe("done");
  });

  it("senza rete, con errori del server o sessione scaduta si riprova", () => {
    for (const status of [0, 401, 408, 429, 500, 503]) expect(classifyStatus(status, true)).toBe("retry");
  });

  it("un rifiuto del server scarta la modifica", () => {
    for (const status of [400, 403, 404, 409, 422]) expect(classifyStatus(status, true)).toBe("rejected");
  });
});

describe("applyToWorkouts", () => {
  const FROM = "2026-10-05";
  const TO = "2026-10-11";
  const insert = (id: string, date: string): Op => ({ kind: "insert", table: "workouts", row: { id, activity: "Corsa", date } });

  it("aggiunge un allenamento della settimana con i valori predefiniti", () => {
    const [w] = applyToWorkouts([], insert("w1", DAY), AT, FROM, TO);
    expect(w).toMatchObject({ id: "w1", activity: "Corsa", status: "planned", source: "app", time: null, created_at: AT });
  });

  it("ignora quelli di un'altra settimana e le modifiche ad altre tabelle", () => {
    expect(applyToWorkouts([], insert("w1", "2026-10-12"), AT, FROM, TO)).toEqual([]);
    expect(applyToWorkouts([], { kind: "insert", table: "tasks", row: { id: "t1", title: "x" } }, AT, FROM, TO)).toEqual([]);
  });

  it("segna come fatto, sposta fuori dalla settimana ed elimina", () => {
    const rows = applyToWorkouts([], insert("w1", DAY), AT, FROM, TO);
    const done = applyToWorkouts(rows, { kind: "update", table: "workouts", patch: { status: "done" }, where: byId("w1") }, AT, FROM, TO);
    expect(done[0].status).toBe("done");
    expect(applyToWorkouts(done, { kind: "update", table: "workouts", patch: { date: "2026-10-14" }, where: byId("w1") }, AT, FROM, TO)).toEqual([]);
    expect(applyToWorkouts(done, { kind: "update", table: "workouts", patch: { deleted_at: AT }, where: byId("w1") }, AT, FROM, TO)).toEqual([]);
  });

  it("un allenamento spostato dentro la settimana compare grazie alla riga intera", () => {
    const moved = { ...applyToWorkouts([], insert("w1", "2026-10-14"), AT, "2026-10-12", "2026-10-18")[0], date: DAY };
    const op: Op = { kind: "update", table: "workouts", patch: { date: DAY }, where: byId("w1"), snapshot: moved };
    expect(applyToWorkouts([], op, AT, FROM, TO).map((w) => w.id)).toEqual(["w1"]);
  });
});
