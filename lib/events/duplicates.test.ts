import { describe, expect, it } from "vitest";
import type { EventRow } from "../supabase/types";
import { isSameEvent, withoutIcloudDuplicates } from "./duplicates";

function event(id: string, source: EventRow["source"], title: string, over: Partial<EventRow> = {}): EventRow {
  return {
    id,
    title,
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
    source,
    kind: "event",
    gcal_calendar_id: null,
    gcal_event_id: null,
    gcal_etag: null,
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    lesson: null,
    is_private: false,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...over,
  };
}

const timed = (start: string, end: string) => ({ start_at: start, end_at: end });

describe("isSameEvent", () => {
  it("riconosce lo stesso volo con orari arrotondati in modo diverso", () => {
    const g = event("g", "gcal", "✈ CA179 · Pechino (PEK) → Manila (MNL)", timed("2026-12-13T11:05:00Z", "2026-12-13T16:05:00Z"));
    const i = event("i", "icloud", "CA179 · Pechino → Manila", timed("2026-12-13T11:00:00Z", "2026-12-13T16:05:00Z"));
    expect(isSameEvent(i, g)).toBe(true);
  });

  it("riconosce lo stesso soggiorno di più giorni", () => {
    const g = event("g", "gcal", "🏨 Anantha Wellness — dormitorio (2 letti)", { all_day: true, start_date: "2026-12-22", end_date: "2026-12-31" });
    const i = event("i", "icloud", "Anantha · 2 posti in dormitorio · Confermato", { all_day: true, start_date: "2026-12-22", end_date: "2026-12-31" });
    expect(isSameEvent(i, g)).toBe(true);
  });

  it("tiene separati eventi diversi alla stessa ora o con lo stesso nome in un altro momento", () => {
    const g = event("g", "gcal", "Riunione progetto", timed("2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z"));
    expect(isSameEvent(event("i", "icloud", "psichiatra ore 9", timed("2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z")), g)).toBe(false);
    expect(isSameEvent(event("i", "icloud", "Riunione progetto", timed("2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z")), g)).toBe(false);
    const allDay = event("a", "icloud", "Riunione progetto", { all_day: true, start_date: "2026-11-02" });
    expect(isSameEvent(allDay, g)).toBe(false);
  });

  it("non tocca le serie", () => {
    const g = event("g", "gcal", "Yoga", timed("2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z"));
    const i = event("i", "icloud", "Yoga", { ...timed("2026-11-02T08:00:00Z", "2026-11-02T09:00:00Z"), rrule: "FREQ=WEEKLY" });
    expect(isSameEvent(i, g)).toBe(false);
  });
});

describe("withoutIcloudDuplicates", () => {
  const g = event("g", "gcal", "✈ CA940 · Roma Fiumicino (FCO) → Pechino (PEK)", timed("2026-12-12T18:50:00Z", "2026-12-13T05:00:00Z"));
  const i = event("i", "icloud", "CA940 · Roma Fiumicino → Pechino", timed("2026-12-12T18:50:00Z", "2026-12-13T05:00:00Z"));
  const other = event("o", "icloud", "ceramica", timed("2026-12-12T17:00:00Z", "2026-12-12T19:30:00Z"));

  it("toglie la copia di iCloud e tiene il resto", () => {
    expect(withoutIcloudDuplicates([g, i, other]).map((e) => e.id)).toEqual(["g", "o"]);
  });

  it("senza l'evento di Google la copia di iCloud resta", () => {
    expect(withoutIcloudDuplicates([i, other]).map((e) => e.id)).toEqual(["i", "o"]);
    expect(withoutIcloudDuplicates([{ ...g, deleted_at: "2026-12-01T00:00:00Z" }, i]).map((e) => e.id)).toEqual(["g", "i"]);
  });

  it("due eventi dell'app o di Google uguali restano entrambi", () => {
    const g2 = { ...g, id: "g2" };
    expect(withoutIcloudDuplicates([g, g2]).map((e) => e.id)).toEqual(["g", "g2"]);
  });
});
