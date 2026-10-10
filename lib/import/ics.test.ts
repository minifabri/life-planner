import { describe, expect, it } from "vitest";
import { eventsForDay } from "../events/day";
import type { EventException, EventRow } from "../supabase/types";
import { isUpcoming, parseIcs, toEventInput, toExceptionInputs, toTaskInput, type ImportItem } from "./ics";

function ics(...blocks: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...blocks, "END:VCALENDAR"].join("\r\n");
}

function vevent(...lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

function vtodo(...lines: string[]): string {
  return ["BEGIN:VTODO", ...lines, "END:VTODO"].join("\r\n");
}

function only(text: string): ImportItem {
  const { items } = parseIcs(text, "Europe/Rome");
  expect(items).toHaveLength(1);
  return items[0];
}

/** L'evento come verrebbe salvato, per verificarlo con la vista del giorno. */
function saved(item: ImportItem): { event: EventRow; exceptions: EventException[] } {
  const event = {
    id: "e",
    source: "app",
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...toEventInput(item),
  } as EventRow;
  const exceptions = toExceptionInputs(item).map((ex, i) => ({ id: `x${i}`, event_id: "e", ...ex }));
  return { event, exceptions };
}

describe("parseIcs", () => {
  it("legge un evento in UTC e lo colloca nel giorno locale", () => {
    const item = only(ics(vevent("UID:a@google.com", "SUMMARY:Dentista", "DTSTART:20261012T073000Z", "DTEND:20261012T083000Z")));
    expect(item).toMatchObject({
      uid: "a@google.com",
      kind: "event",
      title: "Dentista",
      allDay: false,
      startDate: "2026-10-12",
      startAt: "2026-10-12T07:30:00.000Z",
      endAt: "2026-10-12T08:30:00.000Z",
      tz: "Europe/Rome",
    });
  });

  it("rispetta il fuso indicato con TZID", () => {
    const item = only(ics(vevent("UID:a", "SUMMARY:Call", "DTSTART;TZID=America/New_York:20261012T090000", "DURATION:PT45M")));
    expect(item.tz).toBe("America/New_York");
    expect(item.startAt).toBe("2026-10-12T13:00:00.000Z");
    expect(item.endAt).toBe("2026-10-12T13:45:00.000Z");
  });

  it("usa il fuso del profilo per orari senza fuso o con un fuso sconosciuto", () => {
    const floating = only(ics(vevent("UID:a", "SUMMARY:Pranzo", "DTSTART:20261012T130000")));
    expect(floating.startAt).toBe("2026-10-12T11:00:00.000Z");
    expect(floating.warnings).toEqual([]);
    const outlook = only(ics(vevent("UID:b", "SUMMARY:Pranzo", "DTSTART;TZID=W. Europe Standard Time:20261012T130000")));
    expect(outlook.startAt).toBe("2026-10-12T11:00:00.000Z");
    expect(outlook.warnings).toHaveLength(1);
  });

  it("legge i giorni interi con la fine esclusa", () => {
    const one = only(ics(vevent("UID:a", "SUMMARY:Compleanno", "DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261013")));
    expect(one).toMatchObject({ allDay: true, startDate: "2026-10-12", endDate: null, startAt: null });
    const trip = only(ics(vevent("UID:b", "SUMMARY:Viaggio", "DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261015")));
    expect(trip.endDate).toBe("2026-10-14");
  });

  it("riunisce le righe spezzate e toglie gli escape dal testo", () => {
    const item = only(
      ics(vevent("UID:a", "SUMMARY:Cena\\, da Marta", "DESCRIPTION:Portare il vino\\nE il dol", " ce", "LOCATION:Via Roma 1\\; Milano", "DTSTART:20261012T180000Z")),
    );
    expect(item.title).toBe("Cena, da Marta");
    expect(item.notes).toBe("Portare il vino\nE il dolce");
    expect(item.location).toBe("Via Roma 1; Milano");
  });

  it("ignora gli allarmi annidati", () => {
    const item = only(
      ics(vevent("UID:a", "SUMMARY:Yoga", "DTSTART:20261012T180000Z", "BEGIN:VALARM", "DESCRIPTION:Promemoria", "TRIGGER:-PT10M", "END:VALARM")),
    );
    expect(item.notes).toBeNull();
  });

  it("non duplica lo stesso UID e segnala ciò che non importa", () => {
    const { items, skipped } = parseIcs(
      ics(
        vevent("UID:a", "SUMMARY:Uno", "DTSTART:20261012T180000Z"),
        vevent("UID:a", "SUMMARY:Uno", "DTSTART:20261012T180000Z"),
        vevent("UID:b", "SUMMARY:Annullato", "STATUS:CANCELLED", "DTSTART:20261012T180000Z"),
        vevent("UID:c", "SUMMARY:Senza data"),
      ),
    );
    expect(items.map((i) => i.title)).toEqual(["Uno"]);
    expect(skipped.map((s) => s.title)).toEqual(["Annullato", "Senza data"]);
  });

  it("porta la fine della serie al giorno locale", () => {
    // UNTIL alle 22:00 UTC del 30 novembre = 23:00 a Roma dello stesso giorno
    const item = only(
      ics(vevent("UID:a", "SUMMARY:Corso", "DTSTART;TZID=Europe/Rome:20261005T190000", "DTEND;TZID=Europe/Rome:20261005T201500", "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T220000Z")),
    );
    expect(item.rrule).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T235959Z");
    const { event } = saved(item);
    expect(eventsForDay([event], [], "2026-11-30")).toHaveLength(1);
    expect(eventsForDay([event], [], "2026-12-07")).toEqual([]);
  });

  it("importa solo la prima data se la ripetizione non è leggibile", () => {
    const item = only(ics(vevent("UID:a", "SUMMARY:Strano", "DTSTART:20261012T180000Z", "RRULE:FREQ=OGNITANTO")));
    expect(item.rrule).toBeNull();
    expect(item.warnings).toHaveLength(1);
  });

  it("le occorrenze cancellate e spostate diventano eccezioni che la vista del giorno riconosce", () => {
    const item = only(
      ics(
        vevent(
          "UID:a",
          "SUMMARY:Lezione",
          "DTSTART;TZID=Europe/Rome:20261019T190000",
          "DTEND;TZID=Europe/Rome:20261019T201500",
          "RRULE:FREQ=WEEKLY;BYDAY=MO",
          "EXDATE;TZID=Europe/Rome:20261026T190000",
        ),
        vevent(
          "UID:a",
          "SUMMARY:Lezione",
          "RECURRENCE-ID;TZID=Europe/Rome:20261102T190000",
          "DTSTART;TZID=Europe/Rome:20261103T180000",
          "DTEND;TZID=Europe/Rome:20261103T191500",
        ),
      ),
    );
    expect(item.cancelledDates).toEqual(["2026-10-26"]);
    const { event, exceptions } = saved(item);
    expect(eventsForDay([event], exceptions, "2026-10-19")).toHaveLength(1);
    // Cancellata, dopo il cambio dell'ora
    expect(eventsForDay([event], exceptions, "2026-10-26")).toEqual([]);
    // Spostata da lunedì a martedì alle 18
    expect(eventsForDay([event], exceptions, "2026-11-02")).toEqual([]);
    expect(eventsForDay([event], exceptions, "2026-11-03")[0]).toMatchObject({ startTime: "18:00", endTime: "19:15" });
  });

  it("cancella le occorrenze di una serie di giorni interi", () => {
    const item = only(ics(vevent("UID:a", "SUMMARY:Bidoni", "DTSTART;VALUE=DATE:20261012", "RRULE:FREQ=WEEKLY", "EXDATE;VALUE=DATE:20261019")));
    const { event, exceptions } = saved(item);
    expect(eventsForDay([event], exceptions, "2026-10-12")).toHaveLength(1);
    expect(eventsForDay([event], exceptions, "2026-10-19")).toEqual([]);
  });

  it("segnala la modifica di una serie assente dal file", () => {
    const { items, skipped } = parseIcs(ics(vevent("UID:a", "SUMMARY:Orfana", "RECURRENCE-ID:20261102T180000Z", "DTSTART:20261103T180000Z")));
    expect(items).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it("legge i promemoria come attività e lascia fuori quelli completati", () => {
    const { items, skipped } = parseIcs(
      ics(
        vtodo("UID:a", "SUMMARY:Pagare il bollo", "DUE;VALUE=DATE:20261020"),
        vtodo("UID:b", "SUMMARY:Chiamare idraulico", "DUE;TZID=Europe/Rome:20261020T093000"),
        vtodo("UID:c", "SUMMARY:Un giorno"),
        vtodo("UID:d", "SUMMARY:Fatta", "STATUS:COMPLETED"),
      ),
      "Europe/Rome",
    );
    expect(items.map((i) => i.kind)).toEqual(["task", "task", "task"]);
    expect(toTaskInput(items[0], "Europe/Rome")).toMatchObject({ title: "Pagare il bollo", date: "2026-10-20", time: null });
    expect(toTaskInput(items[1], "Europe/Rome")).toMatchObject({ date: "2026-10-20", time: "09:30" });
    expect(toTaskInput(items[2], "Europe/Rome")).toMatchObject({ date: null, time: null });
    expect(skipped).toEqual([{ title: "Fatta", reason: "Già completata" }]);
  });
});

describe("isUpcoming", () => {
  const today = "2026-10-10";

  it("lascia fuori gli eventi passati e tiene quelli in corso", () => {
    const past = only(ics(vevent("UID:a", "SUMMARY:Ieri", "DTSTART:20261009T180000Z")));
    const trip = only(ics(vevent("UID:b", "SUMMARY:Viaggio", "DTSTART;VALUE=DATE:20261008", "DTEND;VALUE=DATE:20261012")));
    expect(isUpcoming(past, today)).toBe(false);
    expect(isUpcoming(trip, today)).toBe(true);
  });

  it("tiene le serie ancora attive e lascia fuori quelle finite", () => {
    const active = only(ics(vevent("UID:a", "SUMMARY:Corso", "DTSTART:20240108T180000Z", "RRULE:FREQ=WEEKLY")));
    const ended = only(ics(vevent("UID:b", "SUMMARY:Corso", "DTSTART:20240108T180000Z", "RRULE:FREQ=WEEKLY;UNTIL=20240630T000000Z")));
    expect(isUpcoming(active, today)).toBe(true);
    expect(isUpcoming(ended, today)).toBe(false);
  });

  it("tiene sempre le attività aperte", () => {
    const task = only(ics(vtodo("UID:a", "SUMMARY:Vecchia", "DUE;VALUE=DATE:20250101")));
    expect(isUpcoming(task, today)).toBe(true);
  });
});

describe("toTaskInput", () => {
  it("trasforma un evento in attività con ora, durata e luogo nelle note", () => {
    const item = only(
      ics(vevent("UID:a", "SUMMARY:Ritirare pacco", "LOCATION:Poste", "DESCRIPTION:Codice 123", "DTSTART:20261012T073000Z", "DTEND:20261012T080000Z")),
    );
    expect(toTaskInput(item, "Europe/Rome")).toMatchObject({
      date: "2026-10-12",
      time: "09:30",
      duration_min: 30,
      notes: "Codice 123\n\nPoste",
    });
  });
});
