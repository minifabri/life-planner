import { describe, expect, it } from "vitest";
import type { EventRow, Task } from "../supabase/types";
import { canConvertEvent, canConvertTask, workoutFromEvent, workoutFromTask } from "./convert";

const TODAY = "2026-10-10";
const NOW = new Date("2026-10-10T10:00:00Z");

function task(over: Partial<Task>): Task {
  return {
    id: "t",
    title: "Corsa",
    notes: null,
    date: null,
    time: null,
    duration_min: null,
    due_date: null,
    window_start: null,
    attention: "low",
    remind: false,
    area_id: null,
    status: "open",
    completed_at: null,
    original_date: null,
    recurrence_id: null,
    source: "manual",
    meal_plan_id: null,
    event_id: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...over,
  };
}

function event(over: Partial<EventRow>): EventRow {
  return {
    id: "e",
    title: "Palestra",
    notes: null,
    location: null,
    start_at: null,
    end_at: null,
    all_day: false,
    start_date: null,
    end_date: null,
    tz: "Europe/Rome",
    rrule: null,
    area_id: null,
    attention: "low",
    source: "app",
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    lesson: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...over,
  };
}

describe("workoutFromTask", () => {
  it("porta con sé giorno, ora, durata e note", () => {
    expect(workoutFromTask(task({ date: "2026-10-12", time: "18:00:00", duration_min: 45, notes: "Lungo fiume" }), TODAY)).toMatchObject({
      activity: "Corsa",
      date: "2026-10-12",
      time: "18:00:00",
      duration_min: 45,
      notes: "Lungo fiume",
      status: "planned",
      completed_at: null,
    });
  });
  it("un'attività completata diventa un allenamento fatto, con lo stesso momento", () => {
    const w = workoutFromTask(task({ date: "2026-10-08", status: "done", completed_at: "2026-10-08T17:00:00Z" }), TODAY);
    expect(w).toMatchObject({ status: "done", completed_at: "2026-10-08T17:00:00Z" });
  });
  it("senza giorno prende la scadenza, e senza nemmeno quella oggi", () => {
    expect(workoutFromTask(task({ due_date: "2026-10-11" }), TODAY).date).toBe("2026-10-11");
    expect(workoutFromTask(task({}), TODAY).date).toBe(TODAY);
  });
  it("un'attività lasciata perdere diventa un allenamento saltato", () => {
    expect(workoutFromTask(task({ date: "2026-10-08", status: "dismissed" }), TODAY).status).toBe("skipped");
  });
});

describe("workoutFromEvent", () => {
  it("l'orario dell'evento diventa ora locale e durata", () => {
    const w = workoutFromEvent(event({ start_at: "2026-10-12T16:00:00Z", end_at: "2026-10-12T17:15:00Z", location: "Palestra Aurora" }), TODAY, NOW);
    expect(w).toMatchObject({ activity: "Palestra", date: "2026-10-12", time: "18:00", duration_min: 75, notes: "Palestra Aurora", status: "planned" });
  });
  it("un evento già finito vale come allenamento fatto", () => {
    const w = workoutFromEvent(event({ start_at: "2026-10-09T16:00:00Z", end_at: "2026-10-09T17:00:00Z" }), TODAY, NOW);
    expect(w).toMatchObject({ status: "done", completed_at: "2026-10-09T17:00:00.000Z" });
  });
  it("un evento di tutto il giorno non ha ora né durata", () => {
    const w = workoutFromEvent(event({ all_day: true, start_date: "2026-10-11" }), TODAY, NOW);
    expect(w).toMatchObject({ date: "2026-10-11", time: null, duration_min: null, status: "planned" });
  });
});

describe("cosa si può trasformare", () => {
  it("non le attività ricorrenti né quelle nate da un pasto", () => {
    expect(canConvertTask(task({}))).toBe(true);
    expect(canConvertTask(task({ recurrence_id: "r" }))).toBe(false);
    expect(canConvertTask(task({ source: "meal" }))).toBe(false);
  });
  it("non le serie né gli eventi arrivati da altri calendari", () => {
    expect(canConvertEvent(event({}))).toBe(true);
    expect(canConvertEvent(event({ rrule: "FREQ=WEEKLY" }))).toBe(false);
    expect(canConvertEvent(event({ source: "icloud" }))).toBe(false);
  });
});
