import { describe, expect, it } from "vitest";
import { occurrenceDates } from "../recurrence/expand";
import type { EventRow } from "../supabase/types";
import { eventsForDay } from "./day";
import { birthdayRule, displayTitle, isQuiet, kindFromTitle, splitQuiet } from "./kind";

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "e",
    title: "Evento",
    notes: null,
    location: null,
    start_at: null,
    end_at: null,
    all_day: true,
    start_date: "2026-10-15",
    end_date: null,
    tz: "Europe/Rome",
    rrule: null,
    area_id: null,
    attention: "low",
    source: "app",
    kind: "event",
    gcal_calendar_id: null,
    gcal_event_id: null,
    gcal_etag: null,
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

describe("kindFromTitle", () => {
  it("riconosce una spedizione dal pacchetto a inizio titolo", () => {
    expect(kindFromTitle("📦 Amazon, scarpe")).toBe("shipment");
    expect(kindFromTitle("📦Zalando")).toBe("shipment");
    expect(kindFromTitle("  📦 Libri")).toBe("shipment");
    expect(kindFromTitle("\u{1F4E6}\u{FE0F} Con il selettore di variante")).toBe("shipment");
  });

  it("lascia gli altri eventi come sono", () => {
    expect(kindFromTitle("Cena da Anna")).toBe("event");
    expect(kindFromTitle("Ritiro 📦 in posta")).toBe("event");
    expect(kindFromTitle("")).toBe("event");
  });
});

describe("displayTitle", () => {
  it("toglie il pacchetto dalle spedizioni", () => {
    expect(displayTitle({ title: "📦 Amazon, scarpe", kind: "shipment" })).toBe("Amazon, scarpe");
  });

  it("tiene il titolo se resterebbe vuoto", () => {
    expect(displayTitle({ title: "📦", kind: "shipment" })).toBe("📦");
  });

  it("non tocca gli altri tipi", () => {
    expect(displayTitle({ title: "📦 Marco", kind: "birthday" })).toBe("📦 Marco");
  });
});

describe("splitQuiet", () => {
  it("separa compleanni e spedizioni dagli eventi dell'agenda, prima i compleanni", () => {
    const events = [
      event({ id: "a", title: "📦 Zalando", kind: "shipment" }),
      event({ id: "b", title: "Riunione", all_day: false, start_date: null, start_at: "2026-10-15T08:00:00Z" }),
      event({ id: "c", title: "Marco", kind: "birthday", start_date: "1990-10-15", rrule: birthdayRule("1990-10-15") }),
      event({ id: "d", title: "📦 Amazon", kind: "shipment" }),
    ];
    const { regular, quiet } = splitQuiet(eventsForDay(events, [], "2026-10-15"));
    expect(regular.map((o) => o.event.id)).toEqual(["b"]);
    expect(quiet.map((o) => o.event.id)).toEqual(["c", "d", "a"]);
    expect(isQuiet("event")).toBe(false);
  });
});

describe("birthdayRule", () => {
  it("si ripete ogni anno nello stesso giorno", () => {
    expect(occurrenceDates(birthdayRule("1990-03-12"), "1990-03-12", "2026-01-01", "2027-12-31")).toEqual(["2026-03-12", "2027-03-12"]);
  });

  it("per il 29 febbraio cade l'ultimo giorno di febbraio", () => {
    expect(occurrenceDates(birthdayRule("2000-02-29"), "2000-02-29", "2027-01-01", "2028-12-31")).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("un compleanno compare ogni anno in Today", () => {
    const e = event({ kind: "birthday", title: "Anna", start_date: "2025-10-15", rrule: birthdayRule("2025-10-15") });
    expect(eventsForDay([e], [], "2030-10-15")).toHaveLength(1);
    expect(eventsForDay([e], [], "2030-10-16")).toHaveLength(0);
  });
});
