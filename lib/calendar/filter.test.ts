import { describe, expect, it } from "vitest";
import type { EventKind, EventRow, Task, Workout } from "../supabase/types";
import { filterDay, isEmptyDay, occurrenceFilter, parseFilters, toggleFilter, type CalendarFilter } from "./filter";
import { buildDay } from "./view";

const TZ = "Europe/Rome";
const DAY = "2026-10-22";

function event(id: string, kind: EventKind, source: EventRow["source"] = "gcal"): EventRow {
  return {
    id,
    title: id,
    kind,
    source,
    all_day: true,
    start_date: DAY,
    end_date: null,
    start_at: null,
    end_at: null,
    rrule: null,
    tz: null,
    deleted_at: null,
    attention: "normal",
    area_id: null,
  } as unknown as EventRow;
}

const events = [
  event("riunione", "event"),
  event("dentista", "appointment"),
  event("volo", "travel"),
  event("hotel", "stay"),
  event("concerto", "ticket"),
  event("yoga", "event", "imayoga"),
  event("pacco", "shipment"),
  event("Lilli", "birthday"),
];
const task = { id: "t", title: "Spesa", date: DAY, status: "open", time: null, due_date: null, deleted_at: null, created_at: "2026-10-01" } as unknown as Task;
const workout = { id: "w", date: DAY, time: null, status: "planned", activity: "Corsa", duration_min: 30 } as unknown as Workout;
const view = buildDay([task], events, [], DAY, DAY, TZ, [workout]);

const titles = (v: typeof view) => [...v.occurrences, ...v.quiet].map((o) => o.event.title).sort();

describe("occurrenceFilter", () => {
  it("raggruppa i tipi di evento nei filtri", () => {
    const byTitle = Object.fromEntries([...view.occurrences, ...view.quiet].map((o) => [o.event.title, occurrenceFilter(o)]));
    expect(byTitle).toEqual({
      riunione: "event",
      dentista: "appointment",
      volo: "travel",
      hotel: "travel",
      concerto: "event",
      yoga: "lesson",
      pacco: "shipment",
      Lilli: "birthday",
    });
  });
});

describe("filterDay", () => {
  it("senza filtri mostra tutto", () => {
    expect(filterDay(view, new Set())).toBe(view);
  });

  it("solo spedizioni", () => {
    const only = filterDay(view, new Set<CalendarFilter>(["shipment"]));
    expect(titles(only)).toEqual(["pacco"]);
    expect(only.untimed).toEqual([]);
    expect(only.workouts).toEqual([]);
    expect(only.load).toEqual(view.load);
  });

  it("più filtri insieme", () => {
    const some = filterDay(view, new Set<CalendarFilter>(["travel", "task", "workout"]));
    expect(titles(some)).toEqual(["hotel", "volo"]);
    expect(some.untimed.map((t) => t.id)).toEqual(["t"]);
    expect(some.workouts.map((w) => w.id)).toEqual(["w"]);
  });

  it("un giorno senza niente dei filtri scelti è vuoto", () => {
    expect(isEmptyDay(view)).toBe(false);
    const empty = buildDay([], [event("x", "event")], [], DAY, DAY, TZ);
    expect(isEmptyDay(filterDay(empty, new Set<CalendarFilter>(["birthday"])))).toBe(true);
  });
});

describe("filtri salvati", () => {
  it("legge solo i filtri conosciuti, nell'ordine dei chip", () => {
    expect(parseFilters('["shipment","pippo","event"]')).toEqual(["event", "shipment"]);
    expect(parseFilters("non json")).toEqual([]);
    expect(parseFilters('{"a":1}')).toEqual([]);
    expect(parseFilters(null)).toEqual([]);
  });

  it("accende e spegne", () => {
    expect(toggleFilter([], "shipment")).toEqual(["shipment"]);
    expect(toggleFilter(["shipment"], "event")).toEqual(["event", "shipment"]);
    expect(toggleFilter(["event", "shipment"], "event")).toEqual(["shipment"]);
  });
});
