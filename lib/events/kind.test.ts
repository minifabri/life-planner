import { describe, expect, it } from "vitest";
import { occurrenceDates } from "../recurrence/expand";
import type { EventRow } from "../supabase/types";
import { eventsForDay } from "./day";
import { birthdayRule, displayTitle, isQuiet, kindFromTitle, samePlace, splitQuiet, travelMode, travelRoute } from "./kind";

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
    is_private: false,
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

describe("kindFromTitle: categorie (D72)", () => {
  it("riconosce le emoji che scrive la schedulazione", () => {
    expect(kindFromTitle("✈ CA940 · Roma Fiumicino (FCO) → Pechino (PEK)")).toBe("travel");
    expect(kindFromTitle("✈️ Volo per Lisbona")).toBe("travel");
    expect(kindFromTitle("🚆 Frecciarossa 9512")).toBe("travel");
    expect(kindFromTitle("🏨 Hotel Centrale — camera doppia")).toBe("stay");
    expect(kindFromTitle("🎟️ Concerto al Palazzo dello Sport")).toBe("ticket");
    expect(kindFromTitle("🍽️ Trattoria da Gino")).toBe("reservation");
    expect(kindFromTitle("💇‍♀️ Taglio e piega")).toBe("appointment");
    expect(kindFromTitle("🩺 Dermatologa")).toBe("appointment");
    expect(kindFromTitle("⏰ Rinnovo carta d'identità")).toBe("deadline");
  });

  it("riconosce le parole quando l'emoji manca", () => {
    expect(kindFromTitle("Treno Italo 9927 · Roma Termini → Napoli Afragola")).toBe("travel");
    expect(kindFromTitle("CA939 · Pechino → Roma Fiumicino")).toBe("travel");
    expect(kindFromTitle("Flight to London")).toBe("travel");
    expect(kindFromTitle("Traghetto per Olbia")).toBe("travel");
    expect(kindFromTitle("Check-in Airbnb Trastevere")).toBe("stay");
    expect(kindFromTitle("Stay at Hotel Lux")).toBe("stay");
    expect(kindFromTitle("Cinema con Anna")).toBe("ticket");
    expect(kindFromTitle("Mostra di Frida Kahlo")).toBe("ticket");
    expect(kindFromTitle("Cena al ristorante Mare")).toBe("reservation");
    expect(kindFromTitle("Degustazione in cantina")).toBe("reservation");
    expect(kindFromTitle("visita ginecologica")).toBe("appointment");
    expect(kindFromTitle("visita endocrinologa gemelli")).toBe("appointment");
    expect(kindFromTitle("psichiatra ore 9")).toBe("appointment");
    expect(kindFromTitle("Visita endocrinologica")).toBe("appointment");
    expect(kindFromTitle("Visita nutrizionale")).toBe("appointment");
    expect(kindFromTitle("Visita guidata ai Fori")).toBe("reservation");
    expect(kindFromTitle("Parrucchiera")).toBe("appointment");
    expect(kindFromTitle("Consulenza commercialista")).toBe("appointment");
    expect(kindFromTitle("SCADENZA · Cancellazione gratuita hotel")).toBe("deadline");
    expect(kindFromTitle("Pagamento bolletta luce")).toBe("deadline");
    expect(kindFromTitle("Abbonamento palestra")).toBe("deadline");
  });

  it("le parole forti di una scadenza vincono", () => {
    expect(kindFromTitle("Scadenza biglietto del treno")).toBe("deadline");
  });

  it("un'attività intorno al viaggio non è il viaggio", () => {
    expect(kindFromTitle("PROPOSTA · Ricontrollare voli e preparare check-in")).toBe("event");
    expect(kindFromTitle("Prenotare il ristorante")).toBe("event");
  });

  it("lascia stare i titoli che non dicono una categoria", () => {
    expect(kindFromTitle("ceramica")).toBe("event");
    expect(kindFromTitle("Partita IVA: chiamare la banca")).toBe("event");
    expect(kindFromTitle("Volontariato al canile")).toBe("event");
    expect(kindFromTitle("Riunione di progetto")).toBe("event");
  });
});

describe("travelMode e travelRoute", () => {
  it("sceglie il mezzo dal titolo", () => {
    expect(travelMode("✈ CA940 · Roma → Pechino")).toBe("plane");
    expect(travelMode("Treno Italo 9927 · Roma → Napoli")).toBe("train");
    expect(travelMode("🚌 Flixbus per Firenze")).toBe("bus");
    expect(travelMode("Traghetto per Olbia")).toBe("ship");
    expect(travelMode("CA939 · Pechino → Roma")).toBe("plane");
  });

  it("legge da dove e per dove", () => {
    expect(travelRoute("✈ CA940 · Roma Fiumicino (FCO) → Pechino (PEK)")).toEqual({ from: ["roma", "fiumicino", "fco"], to: ["pechino", "pek"] });
    expect(travelRoute("Treno Italo 9927 · Roma Termini → Napoli Afragola")).toEqual({ from: ["roma", "termini"], to: ["napoli", "afragola"] });
    expect(travelRoute("Volo da Roma a Milano")).toEqual({ from: ["roma"], to: ["milano"] });
    expect(travelRoute("Treno Bologna - Firenze")).toEqual({ from: ["bologna"], to: ["firenze"] });
    expect(travelRoute("Volo per Lisbona")).toBeNull();
  });

  it("riconosce lo stesso luogo scritto in modi diversi", () => {
    expect(samePlace(["roma", "fiumicino", "fco"], ["roma", "termini"])).toBe(true);
    expect(samePlace(["pechino", "pek"], ["manila", "mnl"])).toBe(false);
  });
});

describe("displayTitle", () => {
  it("toglie l'emoji che ha dato la categoria", () => {
    expect(displayTitle({ title: "✈ CA940 · Roma → Pechino", kind: "travel" })).toBe("CA940 · Roma → Pechino");
    expect(displayTitle({ title: "💇‍♀️ Taglio", kind: "appointment" })).toBe("Taglio");
    expect(displayTitle({ title: "Treno Roma → Napoli", kind: "travel" })).toBe("Treno Roma → Napoli");
  });

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
