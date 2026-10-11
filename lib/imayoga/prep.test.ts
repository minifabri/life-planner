import { describe, expect, it } from "vitest";
import type { LocalLesson, WantedLesson } from "./map";
import { addPrepOps, bookedSummary, followLessons, prepDate, prepNotes, prepState, prepTitle, removePrepOps, type PrepTask } from "./prep";

const TODAY = "2026-10-11";
// Martedì 13 ottobre 2026, 18:30 ora italiana.
const START = "2026-10-13T16:30:00.000Z";

describe("giorno della preparazione", () => {
  it("è il giorno prima della lezione", () => {
    expect(prepDate("2026-10-13", TODAY)).toBe("2026-10-12");
  });

  it("è oggi se la lezione è domani o oggi", () => {
    expect(prepDate("2026-10-12", TODAY)).toBe(TODAY);
    expect(prepDate(TODAY, TODAY)).toBe(TODAY);
  });

  it("non c'è per una lezione passata", () => {
    expect(prepDate("2026-10-10", TODAY)).toBeNull();
  });
});

describe("attività di preparazione", () => {
  const lesson = { id: "e1", title: "Ashtanga · Intermedio", start_at: START, area_id: "area" };

  it("nasce il giorno prima, con giorno e ora della lezione e la stessa area", () => {
    expect(addPrepOps(lesson, "t1", TODAY)).toEqual([
      {
        kind: "insert",
        table: "tasks",
        merge: true,
        row: {
          id: "t1",
          title: "Preparare la lezione: Ashtanga · Intermedio",
          notes: "martedì 13 ott, 18:30",
          date: "2026-10-12",
          area_id: "area",
          source: "lesson",
          event_id: "e1",
          status: "open",
          completed_at: null,
          deleted_at: null,
        },
      },
    ]);
  });

  it("non nasce per una lezione passata", () => {
    expect(addPrepOps({ ...lesson, start_at: "2026-10-09T16:30:00.000Z" }, "t1", TODAY)).toEqual([]);
  });

  it("si toglie senza toccare la lezione", () => {
    expect(removePrepOps("t1", "now")).toEqual([{ kind: "update", table: "tasks", patch: { deleted_at: "now" }, where: [["id", "eq", "t1"]] }]);
  });

  it("dice se la lezione è da preparare o preparata", () => {
    expect(prepState(null)).toBe("none");
    expect(prepState({ status: "open", deleted_at: null })).toBe("to_prep");
    expect(prepState({ status: "done", deleted_at: null })).toBe("prepared");
    expect(prepState({ status: "open", deleted_at: "2026-10-11T08:00:00Z" })).toBe("none");
  });
});

describe("dopo una sync", () => {
  const task = (over: Partial<PrepTask> = {}): PrepTask => ({
    id: "t1",
    event_id: "e1",
    title: prepTitle("Ashtanga · Intermedio"),
    notes: prepNotes(START),
    date: "2026-10-12",
    ...over,
  });
  const local = (over: Partial<LocalLesson> = {}): LocalLesson => ({
    id: "e1",
    title: "Ashtanga · Intermedio",
    location: null,
    start_at: START,
    end_at: "2026-10-13T17:30:00.000Z",
    lesson: null,
    deleted_at: null,
    ...over,
  });
  const wanted = (over: Partial<WantedLesson> = {}): WantedLesson => ({
    id: "e1",
    key: "imayoga:class:c1",
    title: "Ashtanga · Intermedio",
    location: null,
    start_at: START,
    end_at: "2026-10-13T17:30:00.000Z",
    tz: "Europe/Rome",
    lesson: null,
    ...over,
  });

  it("la preparazione sparisce con la lezione", () => {
    expect(followLessons([task()], [local()], [], ["e1"], TODAY)).toEqual({ remove: ["t1"], update: [] });
  });

  it("resta com'è se cambiano solo i prenotati", () => {
    expect(followLessons([task({ date: "2026-10-11" })], [local()], [wanted()], [], TODAY)).toEqual({ remove: [], update: [] });
  });

  it("segue la lezione spostata a un altro giorno", () => {
    const moved = wanted({ start_at: "2026-10-15T16:30:00.000Z" });
    expect(followLessons([task()], [local()], [moved], [], TODAY).update).toEqual([
      { id: "t1", patch: { notes: "giovedì 15 ott, 18:30", date: "2026-10-14" } },
    ]);
  });

  it("con un cambio d'ora nello stesso giorno aggiorna solo il dettaglio", () => {
    const later = wanted({ start_at: "2026-10-13T17:00:00.000Z" });
    expect(followLessons([task({ date: "2026-10-11" })], [local()], [later], [], TODAY).update).toEqual([
      { id: "t1", patch: { notes: "martedì 13 ott, 19:00" } },
    ]);
  });

  it("prende il nuovo nome della lezione", () => {
    const renamed = wanted({ title: "Yoga Flow" });
    expect(followLessons([task()], [local()], [renamed], [], TODAY).update).toEqual([
      { id: "t1", patch: { title: "Preparare la lezione: Yoga Flow" } },
    ]);
  });
});

describe("prenotati", () => {
  it("sui posti disponibili, se la lezione ha un limite", () => {
    const lesson = { individual: false, capacity: 8, booked: ["a", "b", "c"], waitlist: [], assigned: null };
    expect(bookedSummary(lesson)).toBe("3 di 8");
    expect(bookedSummary({ ...lesson, capacity: null })).toBe("3");
  });
});
