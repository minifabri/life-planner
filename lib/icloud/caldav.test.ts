import { describe, expect, it } from "vitest";
import { parseIcs } from "../import/ics";
import {
  calendarsRequest,
  diffEtags,
  etagsRequest,
  isPastWindow,
  multigetRequest,
  parseCalendars,
  parseEtags,
  parseEvents,
  parseHomeSetUrl,
  parsePrincipalUrl,
  principalRequest,
} from "./caldav";

const HOME = "https://p42-caldav.icloud.com/123456/calendars/";

function multistatus(...responses: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/">
${responses.join("\n")}
</multistatus>`;
}

function response(href: string, props: string, missing = ""): string {
  return `<response><href>${href}</href>
<propstat><prop>${props}</prop><status>HTTP/1.1 200 OK</status></propstat>
${missing ? `<propstat><prop>${missing}</prop><status>HTTP/1.1 404 Not Found</status></propstat>` : ""}
</response>`;
}

describe("scoperta dei calendari", () => {
  it("parte dalla radice di iCloud chiedendo l'utente", () => {
    const request = principalRequest();
    expect(request).toMatchObject({ method: "PROPFIND", url: "https://caldav.icloud.com/", depth: "0" });
    expect(request.body).toContain("current-user-principal");
  });

  it("legge l'indirizzo dell'utente, relativo alla radice", () => {
    const xml = multistatus(response("/", "<current-user-principal><href>/123456/principal/</href></current-user-principal>"));
    expect(parsePrincipalUrl(xml, "https://caldav.icloud.com/")).toBe("https://caldav.icloud.com/123456/principal/");
  });

  it("legge la casa dei calendari su un altro server, con qualsiasi prefisso", () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
      <d:response><d:href>/123456/principal/</d:href><d:propstat><d:prop>
      <cal:calendar-home-set><d:href>https://p42-caldav.icloud.com:443/123456/calendars/</d:href></cal:calendar-home-set>
      </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
    expect(parseHomeSetUrl(xml, "https://caldav.icloud.com/123456/principal/")).toBe(HOME);
  });

  it("restituisce null se la proprietà manca", () => {
    const xml = multistatus(response("/", "", "<current-user-principal/>"));
    expect(parsePrincipalUrl(xml, "https://caldav.icloud.com/")).toBeNull();
  });

  it("tiene solo i calendari di eventi, con nome, colore e ctag", () => {
    const xml = multistatus(
      response("/123456/calendars/", "<resourcetype><collection/></resourcetype><displayname>Home</displayname>"),
      response(
        "/123456/calendars/home/",
        `<resourcetype><collection/><C:calendar/></resourcetype><displayname>Casa &amp; famiglia</displayname>
         <CS:getctag>HwoQEgwAAAh4</CS:getctag><A:calendar-color>#FF2968FF</A:calendar-color>
         <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>`,
      ),
      response(
        "/123456/calendars/tasks/",
        `<resourcetype><collection/><C:calendar/></resourcetype><displayname>Promemoria</displayname>
         <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>`,
      ),
      response("/123456/calendars/inbox/", "<resourcetype><collection/><C:schedule-inbox/></resourcetype>"),
      response(
        "/123456/calendars/work/",
        "<resourcetype><collection/><C:calendar/></resourcetype><displayname><![CDATA[Lavoro <team>]]></displayname>",
        "<CS:getctag/><A:calendar-color/>",
      ),
    );
    expect(parseCalendars(xml, HOME)).toEqual([
      { url: `${HOME}home/`, name: "Casa & famiglia", color: "#FF2968", ctag: "HwoQEgwAAAh4" },
      { url: `${HOME}work/`, name: "Lavoro <team>", color: null, ctag: null },
    ]);
    expect(calendarsRequest(HOME)).toMatchObject({ method: "PROPFIND", url: HOME, depth: "1" });
  });
});

describe("eventi", () => {
  it("chiede gli etag del periodo in UTC", () => {
    const request = etagsRequest(`${HOME}home/`, new Date("2026-09-09T22:00:00.000Z"), new Date("2027-10-09T22:00:00.000Z"));
    expect(request).toMatchObject({ method: "REPORT", depth: "1" });
    expect(request.body).toContain('<c:time-range start="20260909T220000Z" end="20271009T220000Z"/>');
  });

  it("legge gli etag e ignora le risposte senza", () => {
    const xml = multistatus(
      response("/123456/calendars/home/a.ics", '<getetag>"e1"</getetag>'),
      response("/123456/calendars/home/b.ics", "", "<getetag/>"),
    );
    expect(parseEtags(xml, `${HOME}home/`)).toEqual([{ url: `${HOME}home/a.ics`, etag: '"e1"' }]);
  });

  it("chiede il contenuto con i percorsi degli eventi", () => {
    const request = multigetRequest(`${HOME}home/`, [`${HOME}home/a%20b.ics`, `${HOME}home/c&d.ics`]);
    expect(request.body).toContain("<d:href>/123456/calendars/home/a%20b.ics</d:href>");
    expect(request.body).toContain("<d:href>/123456/calendars/home/c&amp;d.ics</d:href>");
  });

  it("restituisce un .ics che il parser dell'import sa leggere", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:ABC-123",
      "SUMMARY:Cena da Anna &amp; Luca",
      "DTSTART;TZID=Europe/Rome:20261012T200000",
      "DTEND;TZID=Europe/Rome:20261012T220000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("&#13;\n");
    const xml = multistatus(
      response("/123456/calendars/home/a.ics", `<getetag>"e2"</getetag><C:calendar-data>${ics}</C:calendar-data>`),
      response("/123456/calendars/home/gone.ics", "", "<getetag/><C:calendar-data/>"),
    );
    const events = parseEvents(xml, `${HOME}home/`);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ url: `${HOME}home/a.ics`, etag: '"e2"' });
    const { items } = parseIcs(events[0].ics, "Europe/Rome");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ uid: "ABC-123", title: "Cena da Anna & Luca", startAt: "2026-10-12T18:00:00.000Z" });
  });

  it("legge il contenuto anche dentro CDATA", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:A < B\r\nDTSTART;VALUE=DATE:20261012\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const xml = multistatus(
      response("/c/x.ics", `<getetag>"e"</getetag><C:calendar-data><![CDATA[${ics}]]></C:calendar-data>`),
    );
    expect(parseIcs(parseEvents(xml, HOME)[0].ics, "Europe/Rome").items[0].title).toBe("A < B");
  });
});

describe("diffEtags", () => {
  it("separa ciò che è nuovo o cambiato da ciò che non c'è più", () => {
    const remote = [
      { url: "a", etag: "1" },
      { url: "b", etag: "2-nuovo" },
      { url: "c", etag: "3" },
    ];
    const local = [
      { url: "a", etag: "1" },
      { url: "b", etag: "2" },
      { url: "d", etag: "4" },
    ];
    expect(diffEtags(remote, local)).toEqual({ changed: ["b", "c"], removed: ["d"] });
  });

  it("senza differenze non chiede nulla", () => {
    expect(diffEtags([{ url: "a", etag: "1" }], [{ url: "a", etag: "1" }])).toEqual({ changed: [], removed: [] });
  });
});

describe("isPastWindow", () => {
  const base = { rrule: null, all_day: false, start_date: null, end_date: null, start_at: null, end_at: null, tz: "Europe/Rome" };
  const windowStart = "2026-09-10";

  it("un evento passato, uscito dal periodo, resta come storico", () => {
    expect(isPastWindow({ ...base, start_at: "2026-08-01T08:00:00Z", end_at: "2026-08-01T09:00:00Z" }, windowStart)).toBe(true);
    expect(isPastWindow({ ...base, all_day: true, start_date: "2026-08-01", end_date: "2026-08-03" }, windowStart)).toBe(true);
  });

  it("un evento dentro il periodo che il server non elenca più è stato eliminato", () => {
    expect(isPastWindow({ ...base, start_at: "2026-10-12T08:00:00Z" }, windowStart)).toBe(false);
    expect(isPastWindow({ ...base, all_day: true, start_date: "2026-09-01", end_date: "2026-09-20" }, windowStart)).toBe(false);
  });

  it("sul confine del periodo, nel dubbio, tiene l'evento", () => {
    expect(isPastWindow({ ...base, all_day: true, start_date: "2026-09-10" }, windowStart)).toBe(true);
    expect(isPastWindow({ ...base, all_day: true, start_date: "2026-09-11" }, windowStart)).toBe(false);
  });

  it("una serie conta per le occorrenze che ha ancora", () => {
    const series = { ...base, all_day: true, start_date: "2026-01-05" };
    expect(isPastWindow({ ...series, rrule: "FREQ=WEEKLY" }, windowStart)).toBe(false);
    expect(isPastWindow({ ...series, rrule: "FREQ=WEEKLY;UNTIL=20260601T235959Z" }, windowStart)).toBe(true);
  });
});
