import { describe, expect, it } from "vitest";
import type { EventException, EventRow } from "../supabase/types";
import { eventsForDay } from "./day";

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "e",
    title: "Evento",
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
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...over,
  };
}

describe("eventsForDay", () => {
  it("mostra un evento con orario nel suo giorno locale", () => {
    const e = event({ start_at: "2026-10-10T07:30:00Z", end_at: "2026-10-10T08:30:00Z" });
    const [occ] = eventsForDay([e], [], "2026-10-10");
    expect(occ.startTime).toBe("09:30");
    expect(occ.endTime).toBe("10:30");
    expect(occ.durationMin).toBe(60);
    expect(eventsForDay([e], [], "2026-10-11")).toEqual([]);
  });

  it("assegna al giorno giusto un evento subito dopo mezzanotte", () => {
    // 22:30 UTC del 9 = 00:30 del 10 a Roma
    const e = event({ start_at: "2026-10-09T22:30:00Z", end_at: "2026-10-09T23:00:00Z" });
    expect(eventsForDay([e], [], "2026-10-09")).toEqual([]);
    expect(eventsForDay([e], [], "2026-10-10")).toHaveLength(1);
  });

  it("mostra gli eventi di tutto il giorno per l'intera durata, per primi", () => {
    const trip = event({ id: "trip", all_day: true, start_date: "2026-10-09", end_date: "2026-10-11" });
    const timed = event({ id: "timed", start_at: "2026-10-10T07:00:00Z" });
    expect(eventsForDay([timed, trip], [], "2026-10-10").map((o) => o.event.id)).toEqual(["trip", "timed"]);
    expect(eventsForDay([trip], [], "2026-10-12")).toEqual([]);
  });

  it("una lezione settimanale mantiene l'ora locale dopo il cambio dell'ora", () => {
    // Lunedì 19 ottobre 19:00 CEST; il 26 ottobre è già ora solare
    const e = event({ start_at: "2026-10-19T17:00:00Z", end_at: "2026-10-19T18:15:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    const [occ] = eventsForDay([e], [], "2026-10-26");
    expect(occ.startTime).toBe("19:00");
    expect(occ.endTime).toBe("20:15");
    expect(occ.start?.toISOString()).toBe("2026-10-26T18:00:00.000Z");
    expect(eventsForDay([e], [], "2026-10-27")).toEqual([]);
    expect(eventsForDay([e], [], "2026-10-12")).toEqual([]);
  });

  it("salta le occorrenze cancellate e sposta quelle modificate", () => {
    const e = event({ start_at: "2026-10-19T17:00:00Z", end_at: "2026-10-19T18:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    const cancelled: EventException = {
      id: "x1",
      event_id: "e",
      original_start: "2026-10-26T18:00:00+00:00",
      cancelled: true,
      new_start_at: null,
      new_end_at: null,
    };
    const moved: EventException = {
      id: "x2",
      event_id: "e",
      original_start: "2026-11-02T18:00:00+00:00",
      cancelled: false,
      new_start_at: "2026-11-03T17:00:00Z",
      new_end_at: "2026-11-03T18:00:00Z",
    };
    expect(eventsForDay([e], [cancelled, moved], "2026-10-26")).toEqual([]);
    expect(eventsForDay([e], [cancelled, moved], "2026-11-02")).toEqual([]);
    expect(eventsForDay([e], [cancelled, moved], "2026-11-03")[0].startTime).toBe("18:00");
  });

  it("gestisce gli eventi ricorrenti di tutto il giorno e quelli eliminati", () => {
    const e = event({ all_day: true, start_date: "2026-10-01", rrule: "FREQ=MONTHLY" });
    expect(eventsForDay([e], [], "2026-11-01")).toHaveLength(1);
    expect(eventsForDay([e], [], "2026-11-02")).toEqual([]);
    expect(eventsForDay([{ ...e, deleted_at: "2026-10-02T00:00:00Z" }], [], "2026-11-01")).toEqual([]);
  });
});
