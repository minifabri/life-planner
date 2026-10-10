import { describe, expect, it } from "vitest";
import { weekStart } from "../dates/local";
import type { EventRow, Task } from "../supabase/types";
import { applyToDayEvents, applyToTasks } from "../sync/ops";
import {
  buildDay,
  canMoveEvent,
  dayHighlights,
  dayMarks,
  freeLabel,
  hourRange,
  layoutBlocks,
  monthGrid,
  moveEventPatch,
  periodTasks,
  timedBlocks,
  weekDays,
} from "./view";

const TZ = "Europe/Rome";
const TODAY = "2026-10-10"; // sabato
const AT = "2026-10-01T08:00:00.000Z";

function task(over: Partial<Task> & { id: string }): Task {
  return applyToTasks([], { kind: "insert", table: "tasks", row: { title: over.id, ...over } }, AT)[0];
}

function event(over: Partial<EventRow> & { id: string }): EventRow {
  const full = applyToDayEvents({ events: [], exceptions: [] }, { kind: "insert", table: "events", row: { title: over.id, rrule: "FREQ=DAILY", ...over } }, AT, TODAY, TZ).events[0];
  return { ...full, rrule: over.rrule ?? null };
}

describe("settimane e mesi", () => {
  it("la settimana va da lunedì a domenica", () => {
    expect(weekStart("2026-10-10")).toBe("2026-10-05");
    expect(weekDays("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("la griglia del mese copre settimane intere", () => {
    const october = monthGrid("2026-10-10");
    expect(october[0]).toBe("2026-09-28");
    expect(october.at(-1)).toBe("2026-11-01");
    expect(october).toHaveLength(35);
  });

  it("un mese che inizia di lunedì e dura 28 giorni occupa quattro righe; uno lungo ne occupa sei", () => {
    expect(monthGrid("2027-02-01")).toHaveLength(28);
    expect(monthGrid("2026-08-15")).toHaveLength(42);
  });
});

describe("buildDay", () => {
  const tasks = [
    task({ id: "con orario", date: "2026-10-12", time: "09:00:00", duration_min: 60 }),
    task({ id: "senza orario", date: "2026-10-12" }),
    task({ id: "fatta", date: "2026-10-12", status: "done" }),
    task({ id: "altro giorno", date: "2026-10-13" }),
    task({ id: "nel periodo", due_date: "2026-10-12", window_start: "2026-10-01" }),
    task({ id: "scartata", date: "2026-10-12", status: "dismissed" }),
  ];
  const events = [event({ id: "dentista", start_at: "2026-10-12T13:00:00.000Z", end_at: "2026-10-12T14:00:00.000Z" })];

  it("mette nel giorno eventi, attività con e senza orario, e l'ultimo giorno utile di una finestra", () => {
    const view = buildDay(tasks, events, [], "2026-10-12", TODAY, TZ);
    expect(view.occurrences.map((o) => o.event.id)).toEqual(["dentista"]);
    expect(view.timed.map((t) => t.id)).toEqual(["con orario"]);
    expect(view.untimed.map((t) => t.id)).toEqual(["senza orario", "nel periodo", "fatta"]);
  });

  it("il carico somma eventi e attività aperte", () => {
    expect(buildDay(tasks, events, [], "2026-10-12", TODAY, TZ).load).toMatchObject({ minutes: 120, level: "light" });
  });

  it("un giorno vuoto resta vuoto", () => {
    const view = buildDay(tasks, events, [], "2026-10-14", TODAY, TZ);
    expect([view.occurrences.length, view.timed.length, view.untimed.length, view.load.minutes]).toEqual([0, 0, 0, 0]);
  });
});

describe("dayHighlights", () => {
  it("prima ciò che ha un orario, poi le importanti; conta ciò che resta fuori", () => {
    const tasks = [
      task({ id: "normale", date: "2026-10-12" }),
      task({ id: "importante", date: "2026-10-12", attention: "high" }),
      task({ id: "alle 9", date: "2026-10-12", time: "09:00:00" }),
      task({ id: "fatta", date: "2026-10-12", status: "done" }),
    ];
    const events = [event({ id: "alle 15", start_at: "2026-10-12T13:00:00.000Z" })];
    const { items, more } = dayHighlights(buildDay(tasks, events, [], "2026-10-12", TODAY, TZ));
    expect(items.map((i) => i.title)).toEqual(["alle 9", "alle 15", "importante"]);
    expect(more).toBe(2);
  });
});

describe("dayMarks", () => {
  it("conta eventi, attività, scadenze e segnala le cose importanti", () => {
    const tasks = [
      task({ id: "a", date: "2026-10-12" }),
      task({ id: "b", date: "2026-10-12", attention: "high" }),
      task({ id: "scadenza", due_date: "2026-10-12", window_start: "2026-10-01" }),
      task({ id: "fatta", date: "2026-10-12", status: "done" }),
    ];
    const events = [event({ id: "e", start_at: "2026-10-12T13:00:00.000Z" })];
    const view = buildDay(tasks, events, [], "2026-10-12", TODAY, TZ);
    expect(dayMarks(view, tasks)).toEqual({ events: 1, lessons: 0, tasks: 2, deadlines: 1, important: true });
  });

  it("le lezioni di imayoga hanno un segno a parte", () => {
    const events = [event({ id: "e", start_at: "2026-10-12T13:00:00.000Z" }), event({ id: "lezione", start_at: "2026-10-12T16:00:00.000Z", source: "imayoga" })];
    const marks = dayMarks(buildDay([], events, [], "2026-10-12", TODAY, TZ), []);
    expect(marks.events).toBe(1);
    expect(marks.lessons).toBe(1);
  });
});

describe("freeLabel", () => {
  const day = "2026-10-12";
  const label = (tasks: Task[]) => freeLabel(buildDay(tasks, [], [], day, TODAY, TZ));

  it("giornate vuote e leggere si dicono così", () => {
    expect(label([])).toBe("giornata libera");
    expect(label([task({ id: "a", date: day, time: "09:00:00", duration_min: 60 })])).toBe("giornata leggera");
  });

  it("se tutto finisce entro le 18 dice da che ora è libera", () => {
    expect(label([task({ id: "a", date: day, time: "09:00:00", duration_min: 240 }), task({ id: "b", date: day, time: "15:00:00", duration_min: 90 })])).toBe("libera dalle 17");
  });

  it("altrimenti conta le ore che restano", () => {
    expect(label([task({ id: "a", date: day, time: "09:00:00", duration_min: 180 }), task({ id: "b", date: day, time: "19:00:00", duration_min: 60 })])).toBe("4 h libere");
    expect(label([task({ id: "a", date: day, time: "09:00:00", duration_min: 300 }), task({ id: "b", date: day, time: "19:00:00", duration_min: 180 })])).toBe("giornata piena");
  });
});

describe("periodTasks", () => {
  const tasks = [
    task({ id: "entro domenica", due_date: "2026-10-11", window_start: "2026-10-05" }),
    task({ id: "entro fine mese", due_date: "2026-10-31", window_start: "2026-10-01" }),
    task({ id: "scaduta", due_date: "2026-10-08", window_start: "2026-10-01" }),
    task({ id: "con giorno", date: "2026-10-11", due_date: "2026-10-11" }),
    task({ id: "finestra futura", due_date: "2026-11-30", window_start: "2026-11-01" }),
    task({ id: "fatta", due_date: "2026-10-11", status: "done" }),
  ];

  it("mostra le finestre aperte che toccano la settimana, in ordine di scadenza", () => {
    expect(periodTasks(tasks, "2026-10-05", "2026-10-11", TODAY).map((t) => t.id)).toEqual(["entro domenica", "entro fine mese"]);
  });

  it("in una settimana successiva restano solo le finestre ancora aperte", () => {
    expect(periodTasks(tasks, "2026-10-12", "2026-10-18", TODAY).map((t) => t.id)).toEqual(["entro fine mese"]);
  });
});

describe("spostare un evento", () => {
  it("mantiene l'ora locale anche attraverso il cambio dell'ora", () => {
    // 24 ottobre 10:00 a Roma (UTC+2) → 26 ottobre 10:00 a Roma (UTC+1).
    const e = event({ id: "e", start_at: "2026-10-24T08:00:00.000Z", end_at: "2026-10-24T09:30:00.000Z" });
    expect(moveEventPatch(e, "2026-10-24", "2026-10-26")).toEqual({
      start_at: "2026-10-26T09:00:00.000Z",
      end_at: "2026-10-26T10:30:00.000Z",
    });
  });

  it("sposta le date degli eventi di tutto il giorno", () => {
    const e = event({ id: "e", all_day: true, start_date: "2026-10-12", end_date: "2026-10-13" });
    expect(moveEventPatch(e, "2026-10-12", "2026-10-10")).toEqual({ start_date: "2026-10-10", end_date: "2026-10-11" });
  });

  it("sullo stesso giorno non cambia nulla", () => {
    expect(moveEventPatch(event({ id: "e", start_at: AT }), TODAY, TODAY)).toEqual({});
  });

  it("serie ed eventi di altri calendari non si spostano", () => {
    expect(canMoveEvent({ source: "app", rrule: null })).toBe(true);
    expect(canMoveEvent({ source: "app", rrule: "FREQ=WEEKLY" })).toBe(false);
    expect(canMoveEvent({ source: "gcal", rrule: null })).toBe(false);
    expect(canMoveEvent({ source: "icloud", rrule: null })).toBe(false);
  });
});

describe("griglia oraria", () => {
  const block = (key: string, start: number, end: number) => ({ key, startMin: start, endMin: end });

  it("i blocchi che non si toccano usano tutta la larghezza", () => {
    const placed = layoutBlocks([block("a", 540, 600), block("b", 600, 660)], 0);
    expect(placed.map((b) => [b.key, b.lane, b.lanes])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("i blocchi sovrapposti si affiancano", () => {
    const placed = layoutBlocks([block("a", 540, 660), block("b", 600, 720), block("c", 660, 700)], 0);
    expect(placed.map((b) => [b.key, b.lane, b.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 2],
    ]);
  });

  it("un blocco senza durata occupa comunque lo spazio minimo", () => {
    const placed = layoutBlocks([block("a", 540, 540), block("b", 560, 620)], 45);
    expect(placed.map((b) => [b.key, b.endMin, b.lane, b.lanes])).toEqual([
      ["a", 585, 0, 2],
      ["b", 620, 1, 2],
    ]);
  });

  it("le ore mostrate si allargano a ciò che c'è", () => {
    expect(hourRange([])).toEqual({ startHour: 8, endHour: 20 });
    expect(hourRange([block("presto", 390, 450), block("tardi", 1260, 1350)])).toEqual({ startHour: 6, endHour: 23 });
  });

  it("i blocchi di un giorno sono eventi con orario e attività con orario", () => {
    const tasks = [task({ id: "t", date: "2026-10-12", time: "09:30:00", duration_min: 30 }), task({ id: "senza", date: "2026-10-12" })];
    const events = [
      event({ id: "e", start_at: "2026-10-12T13:00:00.000Z", end_at: "2026-10-12T14:00:00.000Z" }),
      event({ id: "tutto il giorno", all_day: true, start_date: "2026-10-12" }),
    ];
    const blocks = timedBlocks(buildDay(tasks, events, [], "2026-10-12", TODAY, TZ));
    expect(blocks.map((b) => [b.key.split(":")[0], b.startMin, b.endMin])).toEqual([
      ["e", 900, 960],
      ["t", 570, 600],
    ]);
  });
});
