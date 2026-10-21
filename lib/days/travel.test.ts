import { describe, expect, it } from "vitest";
import { kindFromTitle } from "../events/kind";
import type { DayMark, EventRow } from "../supabase/types";
import { toggleMarkPlan } from "./marks";
import { travelDays, withTravelDays } from "./travel";

const TZ = "Europe/Rome";

function event(id: string, title: string, over: Partial<EventRow> = {}): EventRow {
  return {
    id,
    title,
    notes: null,
    location: null,
    start_at: null,
    end_at: null,
    all_day: true,
    start_date: null,
    end_date: null,
    tz: TZ,
    rrule: null,
    area_id: null,
    attention: "low",
    source: "gcal",
    kind: kindFromTitle(title),
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

const flight = (id: string, title: string, start: string, end: string) => event(id, title, { all_day: false, start_at: start, end_at: end });
const allDay = (id: string, title: string, start: string, end: string | null = null) => event(id, title, { start_date: start, end_date: end });

const days = (map: Map<string, string[]>) => [...map.keys()].sort();

describe("travelDays", () => {
  it("segna il giorno di un viaggio e ogni giorno di un soggiorno", () => {
    const events = [
      flight("t", "Treno Italo 9927 · Roma Termini → Napoli Afragola", "2026-11-14T13:30:00Z", "2026-11-14T14:28:00Z"),
      allDay("h", "🏨 Hotel Centrale", "2026-11-20", "2026-11-22"),
      allDay("c", "Cena da Anna", "2026-11-21"),
    ];
    const travel = travelDays(events, [], "2026-11-01", "2026-11-30", TZ);
    expect(days(travel)).toEqual(["2026-11-14", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(travel.get("2026-11-14")).toEqual(["Treno Italo 9927 · Roma Termini → Napoli Afragola"]);
    expect(travel.get("2026-11-21")).toEqual(["Hotel Centrale"]);
  });

  it("un promemoria di tutto il giorno sui voli non segna il giorno", () => {
    const events = [allDay("p", "PROPOSTA · Check-in voli interni e transfer", "2026-11-09"), allDay("v", "✈ Voli interni", "2026-11-10")];
    expect(events[1].kind).toBe("travel");
    expect(days(travelDays(events, [], "2026-11-01", "2026-11-30", TZ))).toEqual([]);
  });

  it("segue le tratte dalla partenza al ritorno", () => {
    const events = [
      flight("a", "✈ CA940 · Roma Fiumicino (FCO) → Pechino (PEK)", "2026-12-12T18:50:00Z", "2026-12-13T05:00:00Z"),
      flight("b", "✈ CA179 · Pechino (PEK) → Manila (MNL)", "2026-12-13T11:05:00Z", "2026-12-13T16:05:00Z"),
      flight("c", "✈ 5J2507 · Manila (MNL) → Cebu (CEB)", "2026-12-21T23:20:00Z", "2026-12-22T00:50:00Z"),
      flight("d", "✈ PR1852 · Cebu (CEB) → Manila (MNL)", "2027-01-01T01:15:00Z", "2027-01-01T02:45:00Z"),
      flight("e", "✈ CA180 · Manila (MNL) → Pechino (PEK)", "2027-01-02T22:20:00Z", "2027-01-03T02:50:00Z"),
      flight("f", "✈ CA939 · Pechino (PEK) → Roma Fiumicino (FCO)", "2027-01-03T05:10:00Z", "2027-01-03T16:50:00Z"),
      // Il viaggio dopo, ripartendo da casa, non allunga quello prima.
      flight("g", "Treno Roma Termini → Milano Centrale", "2027-01-20T08:00:00Z", "2027-01-20T11:00:00Z"),
    ];
    const travel = travelDays(events, [], "2026-12-01", "2027-01-31", TZ);
    const all = days(travel);
    expect(all[0]).toBe("2026-12-12");
    expect(all).toContain("2026-12-25");
    expect(all).toContain("2027-01-03");
    expect(all).not.toContain("2027-01-04");
    expect(all).not.toContain("2027-01-19");
    expect(all).toContain("2027-01-20");
    expect(travel.get("2026-12-25")).toEqual(["CA940 · Roma Fiumicino (FCO) → Pechino (PEK)"]);
  });

  it("trova la partenza anche prima del periodo mostrato", () => {
    const events = [
      flight("a", "Volo da Roma a Lisbona", "2026-11-28T08:00:00Z", "2026-11-28T11:00:00Z"),
      flight("b", "Volo da Lisbona a Roma", "2026-12-05T08:00:00Z", "2026-12-05T11:00:00Z"),
    ];
    expect(days(travelDays(events, [], "2026-12-01", "2026-12-07", TZ))).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
  });

  it("senza ritorno resta solo il giorno del viaggio", () => {
    const events = [flight("a", "Treno Roma → Napoli", "2026-11-14T08:00:00Z", "2026-11-14T09:00:00Z")];
    expect(days(travelDays(events, [], "2026-11-01", "2026-11-30", TZ))).toEqual(["2026-11-14"]);
  });

  it("dal check-in al check-out scritti come due eventi", () => {
    const events = [
      flight("i", "🏨 Check-in Airbnb Trastevere", "2026-11-05T14:00:00Z", "2026-11-05T15:00:00Z"),
      flight("o", "🏨 Check-out Airbnb Trastevere", "2026-11-08T09:00:00Z", "2026-11-08T10:00:00Z"),
    ];
    expect(days(travelDays(events, [], "2026-11-01", "2026-11-30", TZ))).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
});

describe("withTravelDays e toggleMarkPlan", () => {
  const travel = new Map([
    ["2026-11-05", ["Hotel"]],
    ["2026-11-06", ["Hotel"]],
    ["2026-11-07", ["Hotel"]],
  ]);
  const saved: DayMark[] = [
    { id: "m1", date: "2026-11-06", kind: "travel" },
    { id: "m2", date: "2026-11-06", kind: "office" },
  ];

  it("aggiunge i giorni del calendario, tiene quelli a mano e salta quelli tolti", () => {
    const marks = withTravelDays(saved, travel, (d) => d === "2026-11-07");
    expect(marks).toEqual([
      { id: "auto:travel:2026-11-05", date: "2026-11-05", kind: "travel", auto: ["Hotel"] },
      { id: "m1", date: "2026-11-06", kind: "travel", auto: ["Hotel"] },
      { id: "m2", date: "2026-11-06", kind: "office" },
    ]);
  });

  it("togliere un viaggio del calendario lo ricorda, senza cancellare righe che non ci sono", () => {
    const marks = withTravelDays(saved, travel, () => false);
    expect(toggleMarkPlan(marks, "new", "2026-11-05", "travel")).toEqual({ ops: [], dismiss: true, restore: [] });
    const both = toggleMarkPlan(marks, "new", "2026-11-06", "travel");
    expect(both.dismiss).toBe(true);
    expect(both.ops).toEqual([{ kind: "delete", table: "day_marks", where: [["id", "eq", "m1"]] }]);
    expect(both.restore).toEqual([{ kind: "insert", table: "day_marks", row: { id: "m1", date: "2026-11-06", kind: "travel" } }]);
  });

  it("i segni a mano si mettono e si tolgono come prima", () => {
    const marks = withTravelDays(saved, travel, () => false);
    expect(toggleMarkPlan(marks, "new", "2026-11-06", "office")).toEqual({
      ops: [{ kind: "delete", table: "day_marks", where: [["id", "eq", "m2"]] }],
      dismiss: false,
      restore: [],
    });
    expect(toggleMarkPlan(marks, "new", "2026-11-09", "travel").ops).toEqual([
      { kind: "insert", table: "day_marks", row: { id: "new", date: "2026-11-09", kind: "travel" } },
    ]);
  });
});
