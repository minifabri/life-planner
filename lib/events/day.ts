import { addDays, atLocalTime, localTimeString, startOfLocalDay, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import { occurrenceDates } from "../recurrence/expand";
import type { EventException, EventRow } from "../supabase/types";

export type Occurrence = {
  /** Chiave stabile per React: id dell'evento + inizio originale. */
  key: string;
  event: EventRow;
  allDay: boolean;
  start: Date | null;
  end: Date | null;
  /** Inizio previsto dalla serie: identifica l'occorrenza nelle eccezioni. */
  originalStart: Date;
  /** Orari "HH:mm" nel fuso del profilo; null per gli eventi di tutto il giorno. */
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
};

/** Occorrenze degli eventi che toccano il giorno locale `day` (nel fuso `tz` del profilo). */
export function eventsForDay(
  events: EventRow[],
  exceptions: EventException[],
  day: LocalDate,
  tz: string = DEFAULT_TZ,
): Occurrence[] {
  const dayStart = startOfLocalDay(day, tz);
  const dayEnd = startOfLocalDay(addDays(day, 1), tz);
  const byEvent = new Map<string, Map<number, EventException>>();
  for (const ex of exceptions) {
    const map = byEvent.get(ex.event_id) ?? new Map();
    map.set(new Date(ex.original_start).getTime(), ex);
    byEvent.set(ex.event_id, map);
  }

  const out: Occurrence[] = [];
  for (const event of events) {
    if (event.deleted_at) continue;
    const exMap = byEvent.get(event.id);

    if (event.all_day) {
      if (!event.start_date) continue;
      const span = event.end_date && event.end_date > event.start_date ? event.end_date : event.start_date;
      const starts = event.rrule
        ? occurrenceDates(event.rrule, event.start_date, day, day)
        : event.start_date <= day && day <= span
          ? [event.start_date]
          : [];
      for (const d of starts) {
        const originalStart = startOfLocalDay(d, event.tz);
        if (exMap?.get(originalStart.getTime())?.cancelled) continue;
        out.push({
          key: `${event.id}:${d}`,
          event,
          allDay: true,
          start: null,
          end: null,
          originalStart,
          startTime: null,
          endTime: null,
          durationMin: null,
        });
      }
      continue;
    }

    if (!event.start_at) continue;
    const firstStart = new Date(event.start_at);
    const durationMs = event.end_at ? Math.max(0, new Date(event.end_at).getTime() - firstStart.getTime()) : 0;

    let starts: Date[];
    if (event.rrule) {
      // La serie mantiene l'ora locale nel fuso dell'evento, anche attraverso il cambio dell'ora.
      const startDate = localDateString(firstStart, event.tz);
      const wallTime = localTimeString(firstStart, event.tz);
      starts = occurrenceDates(event.rrule, startDate, addDays(day, -1), addDays(day, 1)).map((d) =>
        atLocalTime(d, wallTime, event.tz),
      );
    } else {
      starts = [firstStart];
    }

    for (const originalStart of starts) {
      const ex = exMap?.get(originalStart.getTime());
      if (ex?.cancelled) continue;
      const start = ex?.new_start_at ? new Date(ex.new_start_at) : originalStart;
      const end = ex?.new_end_at ? new Date(ex.new_end_at) : new Date(start.getTime() + durationMs);
      const overlaps = start < dayEnd && (end > dayStart || start >= dayStart);
      if (!overlaps) continue;
      out.push({
        key: `${event.id}:${originalStart.toISOString()}`,
        event,
        allDay: false,
        start,
        end,
        originalStart,
        startTime: start >= dayStart ? localTimeString(start, tz) : "00:00",
        endTime: event.end_at || ex?.new_end_at ? localTimeString(end, tz) : null,
        durationMin: durationMs ? Math.round((Math.min(end.getTime(), dayEnd.getTime()) - Math.max(start.getTime(), dayStart.getTime())) / 60_000) : null,
      });
    }
  }

  return out.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
}
