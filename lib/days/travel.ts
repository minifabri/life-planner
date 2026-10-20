import { addDays, diffDays, type LocalDate } from "../dates/local";
import { eventsForDay } from "../events/day";
import { displayTitle, samePlace, travelRoute } from "../events/kind";
import type { DayMark, EventException, EventRow } from "../supabase/types";

/**
 * Giorni in viaggio dal calendario (D72). Un giorno è "in viaggio" se ha:
 * - un viaggio con un orario o con la tratta (volo, treno, autobus, traghetto); un promemoria di tutto il giorno
 *   ("Check-in voli interni") non basta;
 * - un soggiorno che lo copre (evento di più giorni, o dal check-in al check-out);
 * - un viaggio che è partito da un luogo e un ritorno a quel luogo più avanti, anche con più tratte in mezzo
 *   (Roma → Pechino, Pechino → Manila, …, Pechino → Roma): sono in viaggio tutti i giorni tra la partenza e il ritorno.
 * Non si salva nulla: il segno si ricava ogni volta dagli eventi, e si può togliere giorno per giorno.
 */

/** Quanto si guarda prima e dopo il periodo mostrato per trovare l'andata e il ritorno, o il check-in e il check-out. */
export const TRAVEL_LOOK_AROUND = 30;
/** Un viaggio con tante tratte dura al massimo così: oltre, non si prova a unirle. */
const MAX_TRIP_DAYS = 60;

const CHECK_IN = /check[- ]?in|arrivo/iu;
const CHECK_OUT = /check[- ]?out|partenza/iu;

type Found = { date: LocalDate; title: string; route: { from: string[]; to: string[] } | null };

function* daysBetween(from: LocalDate, to: LocalDate): Generator<LocalDate> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** I giorni da `from` a `to` in cui il calendario dice che si è in viaggio, con i titoli degli eventi da cui si ricava. */
export function travelDays(
  events: EventRow[],
  exceptions: EventException[],
  from: LocalDate,
  to: LocalDate,
  tz: string,
): Map<LocalDate, string[]> {
  const out = new Map<LocalDate, string[]>();
  const relevant = events.filter((e) => e.kind === "travel" || e.kind === "stay");
  if (relevant.length === 0) return out;
  const add = (day: LocalDate, title: string) => {
    if (day < from || day > to) return;
    const titles = out.get(day) ?? [];
    if (!titles.includes(title)) titles.push(title);
    out.set(day, titles);
  };

  // Le tratte, in ordine di partenza (un volo notturno conta nel giorno in cui parte), e i soggiorni.
  const trips: Found[] = [];
  const stays: Found[] = [];
  const seen = new Set<string>();
  for (const day of daysBetween(addDays(from, -TRAVEL_LOOK_AROUND), addDays(to, TRAVEL_LOOK_AROUND))) {
    for (const o of eventsForDay(relevant, exceptions, day, tz)) {
      const title = displayTitle(o.event);
      const route = o.event.kind === "travel" ? travelRoute(o.event.title) : null;
      if (o.event.kind === "stay") add(day, title);
      else if (!o.allDay || route) add(day, title);
      if (seen.has(o.key)) continue;
      seen.add(o.key);
      (o.event.kind === "travel" ? trips : stays).push({ date: day, title, route });
    }
  }

  // Dal check-in al check-out dello stesso soggiorno, scritti come due eventi.
  for (const stay of stays) {
    if (!CHECK_IN.test(stay.title) || CHECK_OUT.test(stay.title)) continue;
    const checkout = stays.find(
      (s) => s.date > stay.date && diffDays(s.date, stay.date) <= TRAVEL_LOOK_AROUND && CHECK_OUT.test(s.title) && !CHECK_IN.test(s.title),
    );
    if (checkout) for (const d of daysBetween(stay.date, checkout.date)) add(d, stay.title);
  }

  // Dalla partenza al ritorno: si seguono le tratte (ognuna parte da dove arriva la precedente) finché una torna al punto di partenza.
  // Le tratte dentro un viaggio già trovato non ne aprono un altro: i giorni hanno già il titolo della partenza.
  let inside = -1;
  for (const [i, first] of trips.entries()) {
    if (!first.route || i <= inside) continue;
    const home = first.route.from;
    let leg = first;
    for (let j = i + 1; j < trips.length; j++) {
      const next = trips[j];
      if (!next.route || diffDays(next.date, first.date) > MAX_TRIP_DAYS) break;
      if (diffDays(next.date, leg.date) > TRAVEL_LOOK_AROUND) break;
      if (!samePlace(leg.route!.to, next.route.from)) continue;
      leg = next;
      if (samePlace(home, next.route.to)) {
        for (const d of daysBetween(first.date, next.date)) add(d, first.title);
        inside = j;
        break;
      }
    }
  }

  return out;
}

/** Prefisso dell'id dei segni ricavati dal calendario: non sono righe di `day_marks`. */
export const AUTO_MARK_PREFIX = "auto:";

/** Chiave della risposta "non sono in viaggio" per un giorno che il calendario segnerebbe. */
export function travelAnswerKey(day: LocalDate): string {
  return `travel:${day}`;
}

/**
 * I segni messi a mano con, in più, i giorni in viaggio dal calendario.
 * Un giorno già segnato a mano tiene il suo segno (con i titoli del calendario accanto);
 * un giorno per cui si è detto "non in viaggio" non riceve il segno automatico.
 */
export function withTravelDays(marks: DayMark[], travel: Map<LocalDate, string[]>, dismissed: (day: LocalDate) => boolean): DayMark[] {
  const out = marks.map((m) => (m.kind === "travel" && travel.has(m.date) ? { ...m, auto: travel.get(m.date) } : m));
  for (const [date, titles] of travel) {
    if (dismissed(date) || marks.some((m) => m.date === date && m.kind === "travel")) continue;
    out.push({ id: `${AUTO_MARK_PREFIX}travel:${date}`, date, kind: "travel", auto: titles });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Un segno salvato in `day_marks`, non ricavato dal calendario. */
export function isSavedMark(mark: DayMark): boolean {
  return !mark.id.startsWith(AUTO_MARK_PREFIX);
}
