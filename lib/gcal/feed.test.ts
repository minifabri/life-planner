import { describe, expect, it } from "vitest";
import { feedEvents, feedName, fingerprint, parseFeedUrl, planFeedSync, type LocalFeedEvent } from "./feed";

const URL_OK = "https://calendar.google.com/calendar/ical/bibi%40gmail.com/private-0123456789abcdef0123456789abcdef/basic.ics";

function calendar(...events: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "X-WR-CALNAME:Bibi\\, personale",
    "X-WR-TIMEZONE:Europe/Rome",
    ...events.flatMap((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("parseFeedUrl", () => {
  it("accetta l'indirizzo segreto iCal di Google", () => {
    expect(parseFeedUrl(` ${URL_OK} `)).toEqual({ url: URL_OK, calendarId: "bibi@gmail.com" });
  });

  it("accetta webcal://", () => {
    expect(parseFeedUrl(URL_OK.replace("https://", "webcal://"))?.calendarId).toBe("bibi@gmail.com");
  });

  it("rifiuta l'indirizzo pubblico, altri host e altre forme", () => {
    expect(parseFeedUrl(URL_OK.replace(/private-[0-9a-f]+/, "public"))).toBeNull();
    expect(parseFeedUrl(URL_OK.replace("calendar.google.com", "calendar.google.com.evil.test"))).toBeNull();
    expect(parseFeedUrl(URL_OK.replace("https://", "http://"))).toBeNull();
    expect(parseFeedUrl(`${URL_OK}?x=1`)).toBeNull();
    expect(parseFeedUrl("https://calendar.google.com/calendar/embed?src=bibi%40gmail.com")).toBeNull();
    expect(parseFeedUrl("non un indirizzo")).toBeNull();
  });
});

describe("feedName", () => {
  it("legge il nome del calendario", () => {
    expect(feedName(calendar())).toBe("Bibi, personale");
    expect(feedName("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toBeNull();
  });
});

describe("feedEvents", () => {
  const ics = calendar(
    ["UID:ship-1@google.com", "DTSTART;VALUE=DATE:20261020", "DTEND;VALUE=DATE:20261021", "SUMMARY:📦 Amazon\\, scarpe"],
    ["UID:meet-1@google.com", "DTSTART:20261016T080000Z", "DTEND:20261016T090000Z", "SUMMARY:Dentista"],
    ["UID:old-1@google.com", "DTSTART:20240101T080000Z", "DTEND:20240101T090000Z", "SUMMARY:Vecchio"],
  );

  it("porta gli eventi del periodo, con le spedizioni riconosciute", () => {
    const events = feedEvents(ics, "Europe/Rome", "2026-10-15");
    expect(events.map((e) => [e.uid, e.kind])).toEqual([
      ["ship-1@google.com", "shipment"],
      ["meet-1@google.com", "event"],
    ]);
    expect(events[0]).toMatchObject({ title: "📦 Amazon, scarpe", all_day: true, start_date: "2026-10-20" });
  });

  it("l'impronta resta uguale se l'evento non cambia e cambia se cambia", () => {
    const a = feedEvents(ics, "Europe/Rome", "2026-10-15");
    const b = feedEvents(ics, "Europe/Rome", "2026-10-15");
    const c = feedEvents(ics.replace("SUMMARY:Dentista", "SUMMARY:Dentista spostato"), "Europe/Rome", "2026-10-15");
    expect(a.map((e) => e.hash)).toEqual(b.map((e) => e.hash));
    expect(c[1].hash).not.toBe(a[1].hash);
    expect(c[0].hash).toBe(a[0].hash);
  });
});

describe("planFeedSync", () => {
  function local(id: string, over: Partial<LocalFeedEvent> = {}): LocalFeedEvent {
    return {
      id,
      gcal_etag: "h",
      rrule: null,
      all_day: false,
      start_date: null,
      end_date: null,
      start_at: "2026-10-16T08:00:00Z",
      end_at: "2026-10-16T09:00:00Z",
      tz: "Europe/Rome",
      ...over,
    };
  }

  it("scrive solo i nuovi e i cambiati", () => {
    const plan = planFeedSync(
      [
        { id: "same", hash: "h" },
        { id: "changed", hash: "h2" },
        { id: "new", hash: "h" },
      ],
      [local("same"), local("changed")],
      "2026-10-15",
    );
    expect(plan).toEqual({ write: ["changed", "new"], remove: [] });
  });

  it("toglie gli eventi spariti, ma non quelli usciti dal periodo perché passati", () => {
    const plan = planFeedSync(
      [],
      [local("gone"), local("past", { start_at: "2026-08-01T08:00:00Z", end_at: "2026-08-01T09:00:00Z" })],
      "2026-10-15",
    );
    expect(plan.remove).toEqual(["gone"]);
  });
});

describe("fingerprint", () => {
  it("è stabile e distingue testi diversi", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});
