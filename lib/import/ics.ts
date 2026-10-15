import { RRule } from "rrule";
import { addDays, atLocalTime, localTimeString, startOfLocalDay, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import type { EventInput, TaskInput } from "../data/api";
import { kindFromTitle } from "../events/kind";
import { hasOccurrenceFrom } from "../recurrence/expand";

/** Un elemento letto da un file iCalendar (.ics), pronto per l'anteprima. */
export type ImportItem = {
  /** UID del file: lo stesso elemento importato due volte non viene duplicato. */
  uid: string;
  kind: "event" | "task";
  title: string;
  notes: string | null;
  location: string | null;
  allDay: boolean;
  /** Giorno locale di inizio nel fuso dell'elemento; null per un'attività senza data. */
  startDate: LocalDate | null;
  /** Ultimo giorno (incluso) di un elemento di più giorni interi. */
  endDate: LocalDate | null;
  startAt: string | null;
  endAt: string | null;
  tz: string;
  rrule: string | null;
  /** Giorni locali delle occorrenze cancellate di una serie. */
  cancelledDates: LocalDate[];
  /** Occorrenze di una serie spostate a un altro orario. */
  moved: { date: LocalDate; startAt: string; endAt: string | null }[];
  /** Cose che l'import non ha potuto portare con sé, da mostrare nell'anteprima. */
  warnings: string[];
};

export type SkippedItem = { title: string; reason: string };

export type ParsedCalendar = { items: ImportItem[]; skipped: SkippedItem[] };

type Property = { name: string; params: Record<string, string>; value: string };
type Component = { type: string; props: Property[] };

/** Riunisce le righe spezzate: una riga che inizia con spazio o tab continua la precedente. */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

function parseLine(line: string): Property | null {
  // Il valore inizia al primo ":" fuori dalle virgolette (i parametri possono contenerne).
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** Componenti VEVENT e VTODO del file; allarmi e fusi annidati vengono ignorati. */
function components(text: string): Component[] {
  const out: Component[] = [];
  const stack: string[] = [];
  let current: Component | null = null;
  for (const line of unfold(text)) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      const type = prop.value.trim().toUpperCase();
      stack.push(type);
      if (type === "VEVENT" || type === "VTODO") current = { type, props: [] };
    } else if (prop.name === "END") {
      const type = stack.pop();
      if (current && type === current.type) {
        out.push(current);
        current = null;
      }
    } else if (current && stack[stack.length - 1] === current.type) {
      current.props.push(prop);
    }
  }
  return out;
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Moment =
  | { kind: "date"; date: LocalDate }
  | { kind: "instant"; instant: Date; tz: string; unknownTz: boolean };

/** Legge DTSTART, DTEND, DUE, EXDATE e simili: giorno intero, UTC, con fuso o "fluttuante". */
function parseMoment(value: string, params: Record<string, string>, defaultTz: string): Moment | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return { kind: "date", date };
  if (m[7]) {
    const instant = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
    return { kind: "instant", instant, tz: defaultTz, unknownTz: false };
  }
  const named = params.TZID;
  const known = !named || isValidTimeZone(named);
  const tz = named && known ? named : defaultTz;
  return { kind: "instant", instant: atLocalTime(date, `${m[4]}:${m[5]}`, tz), tz, unknownTz: !known };
}

/** Durata ISO 8601 ("P1D", "PT1H30M", "P1W") in minuti. */
function durationMinutes(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  return +(m[1] ?? 0) * 10_080 + +(m[2] ?? 0) * 1440 + +(m[3] ?? 0) * 60 + +(m[4] ?? 0);
}

/**
 * Porta la fine della serie (UNTIL) a una data locale: le occorrenze si calcolano su giorni,
 * quindi un UNTIL espresso in UTC non deve togliere o aggiungere l'ultimo giorno.
 */
function normalizeRRule(value: string, tz: string): string | null {
  const parts = value
    .replace(/^RRULE:/i, "")
    .split(";")
    .filter(Boolean)
    .map((part) => {
      const [key, raw] = part.split("=");
      if (key.toUpperCase() !== "UNTIL" || !raw) return part;
      const until = parseMoment(raw, {}, tz);
      if (!until) return part;
      const day = until.kind === "date" ? until.date : localDateString(until.instant, tz);
      return `UNTIL=${day.replaceAll("-", "")}T235959Z`;
    });
  const rrule = parts.join(";");
  try {
    return typeof RRule.parseString(rrule).freq === "number" ? rrule : null;
  } catch {
    return null;
  }
}

function momentDate(moment: Moment, tz: string): LocalDate {
  return moment.kind === "date" ? moment.date : localDateString(moment.instant, tz);
}

/**
 * Legge un file .ics. Gli eventi (VEVENT) e i promemoria (VTODO) riconosciuti finiscono in `items`;
 * tutto ciò che non si può importare finisce in `skipped` con il motivo, mai scartato in silenzio.
 * `defaultTz` è il fuso del profilo, usato per gli orari senza fuso.
 */
export function parseIcs(text: string, defaultTz: string = DEFAULT_TZ): ParsedCalendar {
  const items = new Map<string, ImportItem>();
  const skipped: SkippedItem[] = [];
  const overrides: { uid: string; props: Map<string, Property>; title: string }[] = [];

  for (const component of components(text)) {
    const props = new Map<string, Property>();
    const exdates: Property[] = [];
    for (const p of component.props) {
      if (p.name === "EXDATE") exdates.push(p);
      else if (!props.has(p.name)) props.set(p.name, p);
    }
    const str = (name: string) => {
      const value = props.get(name)?.value;
      return value ? unescapeText(value) || null : null;
    };
    const moment = (name: string) => {
      const p = props.get(name);
      return p ? parseMoment(p.value, p.params, defaultTz) : null;
    };

    const title = str("SUMMARY") ?? "(senza titolo)";
    const status = props.get("STATUS")?.value.trim().toUpperCase();
    const uid = props.get("UID")?.value.trim() || `${title}|${props.get("DTSTART")?.value ?? props.get("DUE")?.value ?? ""}`;
    const warnings: string[] = [];
    const base = { uid, title, notes: str("DESCRIPTION"), location: str("LOCATION"), cancelledDates: [], moved: [], warnings };

    if (component.type === "VTODO") {
      if (status === "COMPLETED" || props.has("COMPLETED")) {
        skipped.push({ title, reason: "Già completata" });
        continue;
      }
      if (status === "CANCELLED") {
        skipped.push({ title, reason: "Annullata" });
        continue;
      }
      if (props.has("RRULE")) warnings.push("La ripetizione non viene importata");
      const when = moment("DUE") ?? moment("DTSTART");
      if (when?.kind === "instant" && when.unknownTz) warnings.push("Fuso orario non riconosciuto: uso il tuo");
      const key = `task:${uid}`;
      if (items.has(key)) continue;
      items.set(key, {
        ...base,
        kind: "task",
        allDay: when?.kind !== "instant",
        startDate: when ? momentDate(when, when.kind === "instant" ? when.tz : defaultTz) : null,
        endDate: null,
        startAt: when?.kind === "instant" ? when.instant.toISOString() : null,
        endAt: null,
        tz: when?.kind === "instant" ? when.tz : defaultTz,
        rrule: null,
      });
      continue;
    }

    if (props.has("RECURRENCE-ID")) {
      overrides.push({ uid, props, title });
      continue;
    }
    if (status === "CANCELLED") {
      skipped.push({ title, reason: "Evento annullato" });
      continue;
    }
    const start = moment("DTSTART");
    if (!start) {
      skipped.push({ title, reason: "Data di inizio mancante o non leggibile" });
      continue;
    }
    const key = `event:${uid}`;
    if (items.has(key)) continue;

    const tz = start.kind === "instant" ? start.tz : defaultTz;
    if (start.kind === "instant" && start.unknownTz) warnings.push("Fuso orario non riconosciuto: uso il tuo");
    const end = moment("DTEND");
    const duration = props.has("DURATION") ? durationMinutes(props.get("DURATION")!.value) : null;

    let rrule: string | null = null;
    if (props.has("RRULE")) {
      rrule = normalizeRRule(props.get("RRULE")!.value, tz);
      if (!rrule) warnings.push("Ripetizione non riconosciuta: importo solo la prima data");
    }
    const cancelledDates = rrule
      ? exdates.flatMap((p) =>
          p.value.split(",").flatMap((v) => {
            const ex = parseMoment(v, p.params, defaultTz);
            return ex ? [momentDate(ex, tz)] : [];
          }),
        )
      : [];

    if (start.kind === "date") {
      // In iCalendar la fine di un evento di giorni interi è esclusa.
      let endDate: LocalDate | null = null;
      if (end) endDate = addDays(momentDate(end, tz), -1);
      else if (duration && duration >= 1440) endDate = addDays(start.date, Math.floor(duration / 1440) - 1);
      items.set(key, {
        ...base,
        kind: "event",
        allDay: true,
        startDate: start.date,
        endDate: endDate && endDate > start.date ? endDate : null,
        startAt: null,
        endAt: null,
        tz,
        rrule,
        cancelledDates,
      });
      continue;
    }

    let endAt: Date | null = null;
    if (end?.kind === "instant") endAt = end.instant;
    else if (duration) endAt = new Date(start.instant.getTime() + duration * 60_000);
    items.set(key, {
      ...base,
      kind: "event",
      allDay: false,
      startDate: localDateString(start.instant, tz),
      endDate: null,
      startAt: start.instant.toISOString(),
      endAt: endAt && endAt > start.instant ? endAt.toISOString() : null,
      tz,
      rrule,
      cancelledDates,
    });
  }

  // Singole occorrenze modificate di una serie: diventano eccezioni dell'evento principale.
  for (const { uid, props, title } of overrides) {
    const master = items.get(`event:${uid}`);
    const id = props.get("RECURRENCE-ID")!;
    const original = parseMoment(id.value, id.params, defaultTz);
    if (!master?.rrule || !original) {
      skipped.push({ title, reason: "Modifica di una serie che non è nel file" });
      continue;
    }
    const date = momentDate(original, master.tz);
    if (props.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") {
      master.cancelledDates.push(date);
      continue;
    }
    const startProp = props.get("DTSTART");
    const start = startProp ? parseMoment(startProp.value, startProp.params, defaultTz) : null;
    if (master.allDay || start?.kind !== "instant") {
      skipped.push({ title, reason: `Modifica della sola data del ${date}: la serie resta invariata` });
      continue;
    }
    const endProp = props.get("DTEND");
    const end = endProp ? parseMoment(endProp.value, endProp.params, defaultTz) : null;
    master.moved.push({
      date,
      startAt: start.instant.toISOString(),
      endAt: end?.kind === "instant" && end.instant > start.instant ? end.instant.toISOString() : null,
    });
    if (title !== master.title) master.warnings.push(`Il ${date} ha un titolo diverso ("${title}"): resta quello della serie`);
  }

  return { items: [...items.values()], skipped };
}

/** Vero se l'elemento riguarda `today` o il futuro: serve a lasciare fuori lo storico del calendario. */
export function isUpcoming(item: ImportItem, today: LocalDate): boolean {
  if (item.kind === "task" || !item.startDate) return true;
  if (item.rrule) return hasOccurrenceFrom(item.rrule, item.startDate, today);
  const last = item.allDay ? (item.endDate ?? item.startDate) : localDateString(new Date(item.endAt ?? item.startAt!), item.tz);
  return last >= today;
}

/** Quando accade, per l'anteprima: giorno e ora nel fuso del profilo. */
export function itemMoment(item: ImportItem, tz: string): { date: LocalDate | null; time: string | null } {
  if (!item.startAt) return { date: item.startDate, time: null };
  const start = new Date(item.startAt);
  return { date: localDateString(start, tz), time: localTimeString(start, tz) };
}

export function toEventInput(item: ImportItem): EventInput {
  return {
    title: item.title,
    notes: item.notes,
    location: item.location,
    start_at: item.allDay ? null : item.startAt,
    end_at: item.allDay ? null : item.endAt,
    all_day: item.allDay,
    start_date: item.allDay ? item.startDate : null,
    end_date: item.allDay ? item.endDate : null,
    tz: item.tz,
    rrule: item.rrule,
    area_id: null,
    attention: "low",
    kind: kindFromTitle(item.title),
  };
}

export type ExceptionInput = {
  original_start: string;
  cancelled: boolean;
  new_start_at: string | null;
  new_end_at: string | null;
};

/** Eccezioni della serie, con l'inizio originale calcolato come fa la vista del giorno. */
export function toExceptionInputs(item: ImportItem): ExceptionInput[] {
  if (!item.rrule) return [];
  const wallTime = item.startAt ? localTimeString(new Date(item.startAt), item.tz) : null;
  const originalStart = (date: LocalDate) =>
    (wallTime ? atLocalTime(date, wallTime, item.tz) : startOfLocalDay(date, item.tz)).toISOString();
  const byStart = new Map<string, ExceptionInput>();
  for (const m of item.moved) {
    const original_start = originalStart(m.date);
    byStart.set(original_start, { original_start, cancelled: false, new_start_at: m.startAt, new_end_at: m.endAt });
  }
  for (const date of item.cancelledDates) {
    const original_start = originalStart(date);
    byStart.set(original_start, { original_start, cancelled: true, new_start_at: null, new_end_at: null });
  }
  return [...byStart.values()];
}

/** L'elemento come attività: giorno e ora nel fuso del profilo, luogo in coda alle note. */
export function toTaskInput(item: ImportItem, tz: string): TaskInput {
  const { date, time } = itemMoment(item, tz);
  const minutes =
    item.startAt && item.endAt ? Math.round((new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000) : 0;
  return {
    title: item.title,
    notes: [item.notes, item.location].filter(Boolean).join("\n\n") || null,
    date,
    time,
    duration_min: minutes > 0 ? minutes : null,
    due_date: null,
    window_start: null,
    attention: "low",
    area_id: null,
  };
}
