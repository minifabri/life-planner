import { describe, expect, it } from "vitest";
import type { Task } from "../supabase/types";
import { classifyTask, groupTasks, isPromoted, overdueSince, promotionLead, windowSummary } from "./classify";

const TODAY = "2026-10-10"; // sabato

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t",
    title: "Attività",
    notes: null,
    date: null,
    time: null,
    duration_min: null,
    due_date: null,
    window_start: null,
    attention: "low",
    area_id: null,
    status: "open",
    completed_at: null,
    original_date: null,
    recurrence_id: null,
    source: "manual",
    meal_plan_id: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...over,
  };
}

describe("classifyTask — attività con giorno", () => {
  it("con orario va in Agenda, senza orario in Da fare oggi", () => {
    expect(classifyTask(task({ date: TODAY, time: "17:00:00" }), TODAY, TODAY)).toBe("agenda");
    expect(classifyTask(task({ date: TODAY }), TODAY, TODAY)).toBe("todo");
  });

  it("aperta e di un giorno passato è rimasta indietro, ma solo guardando oggi", () => {
    const t = task({ date: "2026-10-08" });
    expect(classifyTask(t, TODAY, TODAY)).toBe("overdue");
    expect(classifyTask(t, "2026-10-11", TODAY)).toBeNull();
    // Nel suo giorno resta visibile dov'era.
    expect(classifyTask(t, "2026-10-08", TODAY)).toBe("todo");
  });

  it("di un giorno futuro non compare oggi, compare nel suo giorno", () => {
    const t = task({ date: "2026-10-12", time: "09:00:00" });
    expect(classifyTask(t, TODAY, TODAY)).toBeNull();
    expect(classifyTask(t, "2026-10-12", TODAY)).toBe("agenda");
  });

  it("completata resta nel suo giorno e non finisce tra le rimaste indietro", () => {
    const t = task({ date: "2026-10-08", status: "done", completed_at: "2026-10-08T10:00:00Z" });
    expect(classifyTask(t, TODAY, TODAY)).toBeNull();
    expect(classifyTask(t, "2026-10-08", TODAY)).toBe("todo");
  });

  it("recuperata e completata oggi compare tra le fatte di oggi", () => {
    const t = task({ date: "2026-10-08", status: "done", completed_at: "2026-10-10T09:00:00Z" });
    expect(classifyTask(t, TODAY, TODAY)).toBe("todo");
  });

  it("usa il fuso del profilo per il giorno di completamento", () => {
    // 22:30 UTC del 9 ottobre = 00:30 del 10 a Roma
    const t = task({ status: "done", completed_at: "2026-10-09T22:30:00Z" });
    expect(classifyTask(t, TODAY, TODAY, "Europe/Rome")).toBe("todo");
    expect(classifyTask(t, "2026-10-09", TODAY, "Europe/Rome")).toBeNull();
  });

  it("scartata o eliminata non compare", () => {
    expect(classifyTask(task({ date: TODAY, status: "dismissed" }), TODAY, TODAY)).toBeNull();
    expect(classifyTask(task({ date: TODAY, deleted_at: "2026-10-10T08:00:00Z" }), TODAY, TODAY)).toBeNull();
  });

  it("senza giorno e senza scadenza non compare in Today", () => {
    expect(classifyTask(task(), TODAY, TODAY)).toBeNull();
  });
});

describe("promozione delle attività nel periodo (D32)", () => {
  it("anticipo di 1 giorno per finestre fino a 7 giorni, 3 per le più lunghe", () => {
    expect(promotionLead("2026-10-05", "2026-10-11")).toBe(1);
    expect(promotionLead("2026-10-04", "2026-10-11")).toBe(1); // esattamente 7 giorni
    expect(promotionLead("2026-10-03", "2026-10-11")).toBe(3);
    expect(promotionLead("2026-10-01", "2026-10-31")).toBe(3);
  });

  it("finestra breve: Nel periodo fino a due giorni prima, Da fare oggi dal giorno prima", () => {
    const t = task({ window_start: "2026-10-06", due_date: "2026-10-12" });
    expect(classifyTask(t, TODAY, TODAY)).toBe("window");
    expect(classifyTask(t, "2026-10-11", "2026-10-11")).toBe("todo");
    expect(classifyTask(t, "2026-10-12", "2026-10-12")).toBe("todo");
  });

  it("finestra lunga: promossa negli ultimi 3 giorni", () => {
    const t = task({ window_start: "2026-10-01", due_date: "2026-10-31" });
    expect(isPromoted(t, "2026-10-27")).toBe(false);
    expect(isPromoted(t, "2026-10-28")).toBe(true);
    expect(isPromoted(t, "2026-10-31")).toBe(true);
    expect(classifyTask(t, "2026-10-27", "2026-10-27")).toBe("window");
    expect(classifyTask(t, "2026-10-28", "2026-10-28")).toBe("todo");
  });

  it("senza inizio della finestra usa il giorno di creazione", () => {
    // Creata il 1° ottobre: finestra di 30 giorni → anticipo di 3
    const long = task({ due_date: "2026-10-31", created_at: "2026-10-01T08:00:00Z" });
    expect(isPromoted(long, "2026-10-28")).toBe(true);
    // Creata il 26: finestra di 5 giorni → anticipo di 1
    const short = task({ due_date: "2026-10-31", created_at: "2026-10-26T08:00:00Z" });
    expect(isPromoted(short, "2026-10-28")).toBe(false);
    expect(isPromoted(short, "2026-10-30")).toBe(true);
  });

  it("a finestra scaduta finisce tra le rimaste indietro", () => {
    const t = task({ window_start: "2026-10-01", due_date: "2026-10-09" });
    expect(isPromoted(t, TODAY)).toBe(false);
    expect(classifyTask(t, TODAY, TODAY)).toBe("overdue");
  });

  it("anticipata a un giorno preciso si comporta come un'attività di quel giorno", () => {
    const t = task({ window_start: "2026-10-01", due_date: "2026-10-31", date: TODAY });
    expect(isPromoted(t, "2026-10-30")).toBe(false);
    expect(classifyTask(t, TODAY, TODAY)).toBe("todo");
  });

  it("guardando un giorno futuro compare solo nell'ultimo giorno utile", () => {
    const t = task({ window_start: "2026-10-01", due_date: "2026-10-31" });
    expect(classifyTask(t, "2026-10-20", TODAY)).toBeNull();
    expect(classifyTask(t, "2026-10-31", TODAY)).toBe("todo");
  });
});

describe("groupTasks", () => {
  it("distribuisce e ordina le attività nelle sezioni", () => {
    const tasks = [
      task({ id: "a", date: TODAY, time: "19:00:00" }),
      task({ id: "b", date: TODAY, time: "09:30:00" }),
      task({ id: "c", date: TODAY, attention: "low", created_at: "2026-10-02T08:00:00Z" }),
      task({ id: "d", date: TODAY, attention: "high" }),
      task({ id: "e", date: TODAY, status: "done", completed_at: "2026-10-10T07:00:00Z", attention: "high" }),
      task({ id: "f", date: "2026-10-09" }),
      task({ id: "g", date: "2026-10-07" }),
      task({ id: "h", window_start: "2026-10-01", due_date: "2026-10-31" }),
      task({ id: "i", window_start: "2026-10-06", due_date: "2026-10-18" }),
    ];
    const g = groupTasks(tasks, TODAY, TODAY);
    expect(g.agenda.map((t) => t.id)).toEqual(["b", "a"]);
    expect(g.todo.map((t) => t.id)).toEqual(["d", "c", "e"]);
    expect(g.overdue.map((t) => t.id)).toEqual(["g", "f"]);
    expect(g.window.map((t) => t.id)).toEqual(["i", "h"]);
  });
});

describe("overdueSince", () => {
  it("preferisce il giorno originale", () => {
    expect(overdueSince({ original_date: "2026-10-01", date: "2026-10-08", due_date: null })).toBe("2026-10-01");
    expect(overdueSince({ original_date: null, date: "2026-10-08", due_date: null })).toBe("2026-10-08");
    expect(overdueSince({ original_date: null, date: null, due_date: "2026-10-05" })).toBe("2026-10-05");
  });
});

describe("windowSummary", () => {
  it("riassume per scadenza", () => {
    const tasks = [
      { due_date: "2026-10-18" },
      { due_date: "2026-10-18" },
      { due_date: "2026-10-31" },
      { due_date: "2026-10-31" },
    ];
    expect(windowSummary(tasks, "2026-10-13")).toBe(
      "4 da fare nel periodo · 2 entro domenica · 2 entro fine mese",
    );
  });

  it("con una sola scadenza non ripete il numero", () => {
    expect(windowSummary([{ due_date: "2026-10-31" }], TODAY)).toBe("1 da fare nel periodo · entro fine mese");
  });
});
