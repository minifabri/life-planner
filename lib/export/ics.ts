import { addDays, localTimeString } from "../dates/local";
import { localDateString } from "../dates/today";
import type { EventException, EventRow } from "../supabase/types";

/**
 * Eventi dell'app in formato iCalendar (RFC 5545), leggibile da Google Calendar, Calendario Apple e Outlook.
 * Fa il percorso inverso di `lib/import/ics.ts`.
 */

type ExportEvent = Pick<
  EventRow,
  "id" | "title" | "notes" | "location" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "rrule" | "updated_at"
>;

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Le righe oltre 75 ottetti vanno spezzate, con uno spazio a capo della continuazione. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (d: string) => d.replace(/-/g, "");
const utcStamp = (instant: Date) => instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Ora locale nel fuso dell'evento: "20261012T150000". */
const localStamp = (instant: Date, tz: string) => `${compactDate(localDateString(instant, tz))}T${localTimeString(instant, tz).replace(":", "")}00`;

export function eventsToIcs(events: ExportEvent[], exceptions: Pick<EventException, "event_id" | "original_start" | "cancelled">[] = []): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Life Planner//Export//IT", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const cancelled = exceptions.filter((x) => x.event_id === e.id && x.cancelled).map((x) => new Date(x.original_start));
    lines.push("BEGIN:VEVENT", `UID:${e.id}@life-planner`, `DTSTAMP:${utcStamp(new Date(e.updated_at))}`);

    if (e.all_day && e.start_date) {
      // In iCalendar la fine di un evento di giorni interi è il giorno dopo l'ultimo.
      const last = e.end_date && e.end_date > e.start_date ? e.end_date : e.start_date;
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.start_date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(last, 1))}`);
      for (const x of cancelled) lines.push(`EXDATE;VALUE=DATE:${compactDate(localDateString(x, e.tz))}`);
    } else if (e.start_at) {
      const start = new Date(e.start_at);
      const end = e.end_at ? new Date(e.end_at) : null;
      if (e.rrule) {
        // Una serie tiene l'ora locale del suo fuso, anche attraverso il cambio dell'ora.
        lines.push(`DTSTART;TZID=${e.tz}:${localStamp(start, e.tz)}`);
        if (end) lines.push(`DTEND;TZID=${e.tz}:${localStamp(end, e.tz)}`);
        for (const x of cancelled) lines.push(`EXDATE;TZID=${e.tz}:${localStamp(x, e.tz)}`);
      } else {
        lines.push(`DTSTART:${utcStamp(start)}`);
        if (end) lines.push(`DTEND:${utcStamp(end)}`);
      }
    } else {
      lines.splice(-3);
      continue;
    }

    if (e.rrule) lines.push(`RRULE:${e.rrule.replace(/^RRULE:/i, "")}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
