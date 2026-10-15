import { addDays, type LocalDate } from "../dates/local";
import { kindFromTitle } from "../events/kind";
import { isPastWindow } from "../icloud/caldav";
import { isUpcoming, parseIcs, toEventInput, toExceptionInputs, type ExceptionInput } from "../import/ics";
import type { EventRow } from "../supabase/types";

/** Periodo tenuto allineato: da 30 giorni fa in poi. Il file di Google contiene tutto lo storico. */
export const WINDOW_BACK_DAYS = 30;

/**
 * Legge l'indirizzo segreto in formato iCal di un calendario Google
 * (https://calendar.google.com/calendar/ical/<calendario>/private-<chiave>/basic.ics).
 * Restituisce l'indirizzo pulito e l'id del calendario, oppure null se non è un indirizzo segreto di Google.
 */
export function parseFeedUrl(input: string): { url: string; calendarId: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || url.search || url.hash) return null;
  const m = /^\/calendar\/ical\/([^/]+)\/(private-[0-9a-f]+)\/basic\.ics$/i.exec(url.pathname);
  if (!m) return null;
  let calendarId: string;
  try {
    calendarId = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return { url: url.toString(), calendarId };
}

/** Nome del calendario scritto nel file (X-WR-CALNAME), se c'è. */
export function feedName(ics: string): string | null {
  const m = /^X-WR-CALNAME:(.*)$/m.exec(ics.replace(/\r\n?/g, "\n"));
  const name = m?.[1].replace(/\\([,;\\])/g, "$1").trim();
  return name || null;
}

/** I campi di un evento che la sync scrive: area e attenzione restano quelle scelte nell'app. */
export type FeedEvent = Pick<
  EventRow,
  "title" | "notes" | "location" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "rrule" | "kind"
> & { uid: string; exceptions: ExceptionInput[]; hash: string };

/**
 * Gli eventi del file che riguardano il periodo seguito, ciascuno con un'impronta del contenuto:
 * alla sync successiva si riscrivono solo quelli la cui impronta è cambiata.
 */
export function feedEvents(ics: string, tz: string, today: LocalDate): FeedEvent[] {
  const windowStart = addDays(today, -WINDOW_BACK_DAYS);
  const out: FeedEvent[] = [];
  for (const item of parseIcs(ics, tz).items) {
    if (item.kind !== "event" || !isUpcoming(item, windowStart)) continue;
    const e = toEventInput(item);
    const fields = {
      title: e.title,
      notes: e.notes,
      location: e.location,
      start_at: e.start_at,
      end_at: e.end_at,
      all_day: e.all_day,
      start_date: e.start_date,
      end_date: e.end_date,
      tz: e.tz,
      rrule: e.rrule,
      kind: kindFromTitle(e.title),
    };
    const exceptions = toExceptionInputs(item);
    out.push({ ...fields, uid: item.uid, exceptions, hash: fingerprint(JSON.stringify([fields, exceptions])) });
  }
  return out;
}

export type LocalFeedEvent = Pick<
  EventRow,
  "id" | "gcal_etag" | "rrule" | "all_day" | "start_date" | "end_date" | "start_at" | "end_at" | "tz"
>;

/**
 * Cosa scrivere: gli eventi nuovi o cambiati e quelli da togliere.
 * Un evento che il file non contiene più si toglie, tranne quando è uscito dal periodo perché passato: resta come storico.
 */
export function planFeedSync(
  wanted: { id: string; hash: string }[],
  local: LocalFeedEvent[],
  today: LocalDate,
): { write: string[]; remove: string[] } {
  const windowStart = addDays(today, -WINDOW_BACK_DAYS);
  const byId = new Map(local.map((l) => [l.id, l]));
  const wantedIds = new Set(wanted.map((w) => w.id));
  return {
    write: wanted.filter((w) => byId.get(w.id)?.gcal_etag !== w.hash).map((w) => w.id),
    remove: local.filter((l) => !wantedIds.has(l.id) && !isPastWindow(l, windowStart)).map((l) => l.id),
  };
}

/** Impronta breve e stabile di un testo (cyrb53): basta a riconoscere un cambiamento, non è una protezione. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
