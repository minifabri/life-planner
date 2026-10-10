import { addDays, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import { hasOccurrenceFrom } from "../recurrence/expand";
import type { EventRow } from "../supabase/types";

/**
 * Richieste e risposte CalDAV per il calendario iCloud (technical-design.md, 9.6).
 * Modulo puro: le richieste descritte qui vengono inoltrate dalla Edge Function `icloud-caldav`.
 */

export const ICLOUD_CALDAV_URL = "https://caldav.icloud.com/";

export type DavRequest = { method: "PROPFIND" | "REPORT"; url: string; depth: "0" | "1"; body: string };

export type RemoteCalendar = { url: string; name: string; color: string | null; ctag: string | null };
export type RemoteEtag = { url: string; etag: string };
export type RemoteEvent = RemoteEtag & { ics: string };

/* ---------------- XML ---------------- */

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? whole;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
  });
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => `&${Object.keys(ENTITIES).find((k) => ENTITIES[k] === c)};`);
}

/** Nome senza prefisso di namespace: i server scelgono prefissi diversi per gli stessi elementi. */
function localName(name: string): string {
  return name.slice(name.indexOf(":") + 1).toLowerCase();
}

/** Lettura minima di un documento XML: elementi, attributi e testo, senza namespace. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const token =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s>/]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(token)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[localName(a[1])] = decodeEntities(a[2] ?? a[3] ?? "");
      }
      const node: XmlNode = { name: localName(m[3]), attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  return root;
}

function descendants(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    descendants(child, name, out);
  }
  return out;
}

function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

type DavResponse = { url: string; props: Map<string, XmlNode> };

/** Le risposte di un multistatus, con le sole proprietà restituite con stato 200. */
function responses(xml: string, baseUrl: string): DavResponse[] {
  const out: DavResponse[] = [];
  for (const response of descendants(parseXml(xml), "response")) {
    const href = child(response, "href")?.text.trim();
    if (!href) continue;
    const props = new Map<string, XmlNode>();
    for (const propstat of response.children.filter((c) => c.name === "propstat")) {
      if (!/\s200(\s|$)/.test(child(propstat, "status")?.text ?? "")) continue;
      for (const prop of child(propstat, "prop")?.children ?? []) props.set(prop.name, prop);
    }
    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ url, props });
  }
  return out;
}

function propfind(props: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">' +
    `<d:prop>${props}</d:prop></d:propfind>`
  );
}

/** L'indirizzo dentro la prima proprietà `name` trovata (es. current-user-principal → href). */
function hrefProp(xml: string, baseUrl: string, name: string): string | null {
  for (const response of responses(xml, baseUrl)) {
    const href = child(response.props.get(name), "href")?.text.trim();
    if (href) return new URL(href, baseUrl).toString();
  }
  return null;
}

/* ---------------- Scoperta dei calendari ---------------- */

export function principalRequest(): DavRequest {
  return { method: "PROPFIND", url: ICLOUD_CALDAV_URL, depth: "0", body: propfind("<d:current-user-principal/>") };
}

export function parsePrincipalUrl(xml: string, baseUrl: string): string | null {
  return hrefProp(xml, baseUrl, "current-user-principal");
}

export function homeSetRequest(principalUrl: string): DavRequest {
  return { method: "PROPFIND", url: principalUrl, depth: "0", body: propfind("<c:calendar-home-set/>") };
}

export function parseHomeSetUrl(xml: string, baseUrl: string): string | null {
  return hrefProp(xml, baseUrl, "calendar-home-set");
}

export function calendarsRequest(homeUrl: string): DavRequest {
  return {
    method: "PROPFIND",
    url: homeUrl,
    depth: "1",
    body: propfind(
      "<d:resourcetype/><d:displayname/><cs:getctag/><a:calendar-color/><c:supported-calendar-component-set/>",
    ),
  };
}

/** I calendari che contengono eventi: restano fuori promemoria, posta in arrivo e notifiche. */
export function parseCalendars(xml: string, baseUrl: string): RemoteCalendar[] {
  const out: RemoteCalendar[] = [];
  for (const { url, props } of responses(xml, baseUrl)) {
    if (!child(props.get("resourcetype"), "calendar")) continue;
    const components = props.get("supported-calendar-component-set")?.children.map((c) => c.attrs.name?.toUpperCase());
    if (components?.length && !components.includes("VEVENT")) continue;
    // Apple indica il colore come #RRGGBBAA.
    const color = /^#[0-9a-f]{6}/i.exec(props.get("calendar-color")?.text.trim() ?? "")?.[0] ?? null;
    out.push({
      url,
      name: props.get("displayname")?.text.trim() || "Calendario",
      color,
      ctag: props.get("getctag")?.text.trim() || null,
    });
  }
  return out;
}

/* ---------------- Eventi ---------------- */

function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

/** Etag degli eventi che toccano il periodo: serve a capire cosa è cambiato senza scaricare tutto. */
export function etagsRequest(calendarUrl: string, from: Date, to: Date): DavRequest {
  return {
    method: "REPORT",
    url: calendarUrl,
    depth: "1",
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      "<d:prop><d:getetag/></d:prop>" +
      '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">' +
      `<c:time-range start="${utcStamp(from)}" end="${utcStamp(to)}"/>` +
      "</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>",
  };
}

export function parseEtags(xml: string, baseUrl: string): RemoteEtag[] {
  return responses(xml, baseUrl).flatMap(({ url, props }) => {
    const etag = props.get("getetag")?.text.trim();
    return etag ? [{ url, etag }] : [];
  });
}

/** Scarica il contenuto .ics degli eventi indicati. */
export function multigetRequest(calendarUrl: string, eventUrls: string[]): DavRequest {
  const hrefs = eventUrls.map((url) => `<d:href>${escapeXml(new URL(url).pathname)}</d:href>`).join("");
  return {
    method: "REPORT",
    url: calendarUrl,
    depth: "1",
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      `<d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs}</c:calendar-multiget>`,
  };
}

export function parseEvents(xml: string, baseUrl: string): RemoteEvent[] {
  return responses(xml, baseUrl).flatMap(({ url, props }) => {
    const etag = props.get("getetag")?.text.trim();
    const ics = props.get("calendar-data")?.text;
    return etag && ics ? [{ url, etag, ics }] : [];
  });
}

/* ---------------- Confronto con ciò che è già salvato ---------------- */

export type LocalEtag = { url: string; etag: string | null };

/** Cosa scaricare (nuovo o con etag diverso) e cosa non è più sul server. */
export function diffEtags(remote: RemoteEtag[], local: LocalEtag[]): { changed: string[]; removed: string[] } {
  const known = new Map(local.map((l) => [l.url, l.etag]));
  const present = new Set(remote.map((r) => r.url));
  return {
    changed: remote.filter((r) => known.get(r.url) !== r.etag).map((r) => r.url),
    removed: [...new Set(local.map((l) => l.url))].filter((url) => !present.has(url)),
  };
}

type Timing = Pick<EventRow, "rrule" | "all_day" | "start_date" | "end_date" | "start_at" | "end_at" | "tz">;

/**
 * Un evento che il server non elenca più è stato eliminato, oppure è semplicemente uscito dal periodo
 * richiesto perché ormai passato. Nel secondo caso resta nell'app come storico.
 * `windowStart` è il primo giorno del periodo chiesto al server.
 */
export function isPastWindow(event: Timing, windowStart: LocalDate): boolean {
  const start = event.all_day ? event.start_date : event.start_at ? localDateString(new Date(event.start_at), event.tz) : null;
  if (!start) return false;
  if (event.rrule) {
    try {
      return !hasOccurrenceFrom(event.rrule, start, windowStart);
    } catch {
      return false;
    }
  }
  const last = event.all_day
    ? (event.end_date ?? start)
    : localDateString(new Date(event.end_at ?? event.start_at!), event.tz);
  // Un giorno di margine: sul confine del periodo, nel dubbio, l'evento si tiene.
  return last < addDays(windowStart, 1);
}
