import { describe, expect, it } from "vitest";
import { PRIVATE_EVENT_TITLE, PRIVATE_TASK_TITLE, eventFromStub, isStub, mergeById, neutralized, taskFromStub } from "./items";

const at = "2026-10-16T08:00:00Z";

describe("segnaposto delle riservate", () => {
  it("un'attività riservata a Log bloccato ha solo quando e stato", () => {
    const task = taskFromStub({
      id: "t1",
      date: "2026-10-20",
      time: "10:00:00",
      duration_min: 60,
      due_date: null,
      window_start: null,
      status: "open",
      completed_at: null,
      original_date: null,
      created_at: at,
      updated_at: at,
    });
    expect(task.title).toBe(PRIVATE_TASK_TITLE);
    expect(task).toMatchObject({ date: "2026-10-20", time: "10:00:00", duration_min: 60, notes: null, area_id: null, attention: "low", is_private: true });
  });

  it("un evento riservato a Log bloccato non ha luogo né area", () => {
    const event = eventFromStub({
      id: "e1",
      start_at: "2026-10-20T08:00:00Z",
      end_at: "2026-10-20T09:00:00Z",
      all_day: false,
      start_date: null,
      end_date: null,
      tz: "Europe/Rome",
      rrule: "FREQ=WEEKLY;BYDAY=TU",
      created_at: at,
      updated_at: at,
    });
    expect(event).toMatchObject({ title: PRIVATE_EVENT_TITLE, location: null, area_id: null, kind: "event", source: "app", rrule: "FREQ=WEEKLY;BYDAY=TU", is_private: true });
  });

  it("isStub vale solo per le riservate a Log bloccato", () => {
    expect(isStub({ title: "x", is_private: true }, false)).toBe(true);
    expect(isStub({ title: "x", is_private: true }, true)).toBe(false);
    expect(isStub({ title: "x", is_private: false }, false)).toBe(false);
  });
});

describe("neutralized", () => {
  it("toglie titolo e note solo alle riservate", () => {
    expect(neutralized({ title: "Psicologa", notes: "studio", is_private: true }, "Riservato")).toEqual({ title: "Riservato", notes: null, is_private: true });
    const open = { title: "Spesa", notes: "latte", is_private: false };
    expect(neutralized(open, "Riservato")).toBe(open);
  });

  it("toglie anche il luogo di un evento", () => {
    expect(neutralized({ title: "Visita", notes: null, location: "Via Roma 1", is_private: true }, "Riservato")).toEqual({
      title: "Riservato",
      notes: null,
      location: null,
      is_private: true,
    });
  });

  it("non aggiunge note dove non c'erano", () => {
    expect(neutralized({ title: "Visita", is_private: true }, "Riservato")).toEqual({ title: "Riservato", is_private: true });
  });
});

describe("mergeById", () => {
  it("unisce senza doppioni e preferisce la riga riservata", () => {
    const merged = mergeById(
      [
        { id: "a", v: 1 },
        { id: "b", v: 1 },
      ],
      [{ id: "b", v: 2 }],
    );
    expect(merged).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ]);
  });

  it("senza riservate restituisce lo stesso elenco", () => {
    const open = [{ id: "a" }];
    expect(mergeById(open, [])).toBe(open);
  });
});
