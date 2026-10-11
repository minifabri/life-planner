import type { Workout } from "../supabase/types";

// Questo modulo finisce nella Edge Function `health-workouts`: niente librerie, le date passano da Intl.
type LocalDate = string;
const DEFAULT_TZ = "Europe/Rome";

/** Quanti allenamenti si accettano in un solo invio. */
export const MAX_WORKOUTS = 200;

/** Discipline riconosciute nei nomi di Salute, in italiano e in inglese: basta che una parola cominci così. */
const DISCIPLINES: [name: string, words: string[]][] = [
  ["Corsa", ["corsa", "run", "jogging"]],
  ["Camminata", ["camminata", "walk", "passeggiata"]],
  ["Escursione", ["escursion", "hik", "trekking"]],
  ["Bici", ["bici", "ciclismo", "cycl", "bike"]],
  ["Nuoto", ["nuoto", "swim"]],
  ["Yoga", ["yoga"]],
  ["Pilates", ["pilates"]],
  ["Hiit", ["hiit", "interval"]],
  ["Forza", ["forza", "strength", "pesi", "palestra", "weight"]],
];

function discipline(text: string): string | null {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  return DISCIPLINES.find(([, starts]) => words.some((w) => starts.some((s) => w.startsWith(s))))?.[0] ?? null;
}

/** Chiave con cui si confrontano le discipline: "Corsa lenta" e "Outdoor Run" sono la stessa. */
export function disciplineKey(text: string): string {
  return (discipline(text) ?? text.trim().replace(/\s+/g, " ")).toLowerCase();
}

/** Il nome mostrato per un tipo di allenamento di Salute. */
export function activityName(type: string): string {
  const name = discipline(type) ?? type.trim().replace(/\s+/g, " ");
  return name ? name[0].toUpperCase() + name.slice(1, 80) : "Allenamento";
}

/** Un allenamento di Salute, già portato alle unità e al fuso dell'app. */
export type HealthWorkout = {
  health_id: string;
  activity: string;
  date: LocalDate;
  /** "HH:mm" */
  time: string;
  /** Fine dell'allenamento: diventa `completed_at`. */
  ended_at: string;
  duration_min: number | null;
  distance_m: number | null;
  energy_kcal: number | null;
  avg_hr: number | null;
};

type Raw = Record<string, unknown>;

function pick(raw: Raw, ...keys: string[]): unknown {
  for (const key of keys) if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  return undefined;
}

/** Numero e unità di un valore: 312, "312 kcal", "5,2 km". */
function measure(value: unknown): { n: number; unit: string; text: string } | null {
  if (typeof value === "number") return Number.isFinite(value) ? { n: value, unit: "", text: String(value) } : null;
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(\p{L}*)/u);
  if (!match) return null;
  return { n: Number(match[1].replace(",", ".")), unit: match[2].toLowerCase(), text: match[1] };
}

function positiveInt(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 && rounded < 10_000_000 ? rounded : null;
}

/** Minuti da `duration_min`, da "1:02:33" o "45:12", o da un numero di minuti. */
function durationMin(raw: Raw): number | null {
  const value = pick(raw, "duration_min", "duration");
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map((p) => Number(p.trim().replace(",", ".")));
    if (parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return null;
    const [s = 0, m = 0, h = 0] = parts.reverse();
    return h * 60 + m + s / 60;
  }
  return measure(value)?.n ?? null;
}

function distanceMeters(raw: Raw): number | null {
  const meters = measure(pick(raw, "distance_m"));
  if (meters) return meters.n;
  const km = measure(pick(raw, "distance_km"));
  if (km) return km.n * 1000;
  const distance = measure(pick(raw, "distance"));
  if (!distance) return null;
  if (distance.unit === "m" || distance.unit.startsWith("met")) return distance.n;
  if (distance.unit.startsWith("mi")) return distance.n * 1609.344;
  // Senza unità: fino a 200 sono chilometri, oltre sono metri.
  return distance.unit || distance.n < 200 ? distance.n * 1000 : distance.n;
}

function energyKcal(raw: Raw): number | null {
  const energy = measure(pick(raw, "energy_kcal", "energy", "calories"));
  if (!energy) return null;
  // "1.234 kcal" è scritto con il punto delle migliaia: un allenamento non brucia una chilocaloria.
  const n = /^\d{1,2}[.,]\d{3}$/.test(energy.text) ? Number(energy.text.replace(/[.,]/, "")) : energy.n;
  return energy.unit === "kj" ? n / 4.184 : n;
}

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** Giorno e ora ("HH:mm") di un istante nel fuso indicato. */
function localParts(instant: Date, tz: string): { date: LocalDate; time: string } {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const part = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` };
}

/** Istante di un giorno e un'ora locali: si corregge l'ora UTC con lo scarto del fuso in quel momento. */
function fromLocal(date: LocalDate, time: string, tz: string): Date {
  const wanted = Date.parse(`${date}T${time}:00Z`);
  let instant = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = localParts(new Date(instant), tz);
    instant -= Date.parse(`${shown.date}T${shown.time}:00Z`) - wanted;
  }
  return new Date(instant);
}

/** Giorno, ora e istante di una data ISO; senza fuso vale l'ora del profilo. */
function parseInstant(value: unknown, tz: string): { date: LocalDate; time: string; instant: Date } | null {
  if (typeof value !== "string") return null;
  const wall = value.trim().match(WALL_CLOCK);
  if (wall) return { date: wall[1], time: wall[2], instant: fromLocal(wall[1], wall[2], tz) };
  const instant = new Date(value.trim());
  return Number.isNaN(instant.getTime()) ? null : { ...localParts(instant, tz), instant };
}

function toHealthWorkout(raw: Raw, tz: string): HealthWorkout | null {
  const start = parseInstant(pick(raw, "start", "start_date"), tz);
  if (!start) return null;
  const end = parseInstant(pick(raw, "end", "end_date"), tz);
  const elapsed = end && end.instant > start.instant ? (end.instant.getTime() - start.instant.getTime()) / 60_000 : null;
  const duration = positiveInt(durationMin(raw) ?? elapsed);
  const type = String(pick(raw, "type", "activity", "name") ?? "");
  const id = String(pick(raw, "id") ?? "").trim();
  const finished = end && end.instant > start.instant ? end.instant : new Date(start.instant.getTime() + (duration ?? 0) * 60_000);
  return {
    // Senza identificativo di Salute, inizio e disciplina bastano a riconoscere lo stesso allenamento.
    health_id: id ? id.slice(0, 200) : `${start.date}T${start.time}|${disciplineKey(type) || "allenamento"}`,
    activity: activityName(type),
    date: start.date,
    time: start.time,
    ended_at: finished.toISOString(),
    duration_min: duration && duration <= 24 * 60 ? duration : null,
    distance_m: positiveInt(distanceMeters(raw)),
    energy_kcal: positiveInt(energyKcal(raw)),
    avg_hr: positiveInt(measure(pick(raw, "avg_hr", "heart_rate"))?.n),
  };
}

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Legge ciò che manda il Comando rapido: `{ "workouts": [...] }` oppure direttamente l'elenco.
 * Le voci senza un inizio leggibile si scartano; `null` se la richiesta non è un elenco o è troppo lunga.
 */
export function parseHealthPayload(body: unknown, timezone: string = DEFAULT_TZ): { workouts: HealthWorkout[]; rejected: number } | null {
  const tz = validTimeZone(timezone) ? timezone : DEFAULT_TZ;
  const list = Array.isArray(body) ? body : (body as { workouts?: unknown } | null)?.workouts;
  if (!Array.isArray(list) || list.length > MAX_WORKOUTS) return null;
  const workouts = list.map((item) => (item && typeof item === "object" ? toHealthWorkout(item as Raw, tz) : null));
  const valid = workouts.filter((w) => w !== null);
  return { workouts: valid, rejected: list.length - valid.length };
}

export type ExistingWorkout = Pick<Workout, "id" | "activity" | "date" | "time" | "status" | "health_id" | "deleted_at">;

export type HealthInsert = Omit<HealthWorkout, "ended_at"> & { status: "done"; completed_at: string; source: "health" };

export type HealthPlan = {
  /** Allenamenti già in programma (o segnati a mano) che Salute conferma. */
  complete: { id: string; patch: Partial<Workout> }[];
  /** Allenamenti che nell'app non c'erano. */
  create: HealthInsert[];
  /** Già arrivati con un invio precedente: non si toccano, nemmeno se eliminati nell'app. */
  known: number;
};

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function withoutNulls(patch: Partial<Workout>): Partial<Workout> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null));
}

/**
 * Abbina gli allenamenti di Salute a quelli dell'app: stesso giorno e stessa disciplina completano
 * quello in programma (il più vicino per orario); gli altri si aggiungono come già fatti.
 * `existing`: gli allenamenti dei giorni interessati e quelli con gli stessi `health_id`, eliminati compresi.
 */
export function planHealthImport(incoming: HealthWorkout[], existing: ExistingWorkout[]): HealthPlan {
  const seen = new Set(existing.map((w) => w.health_id).filter((id) => id !== null));
  const taken = new Set<string>();
  const plan: HealthPlan = { complete: [], create: [], known: 0 };

  for (const w of [...incoming].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))) {
    if (seen.has(w.health_id)) {
      plan.known++;
      continue;
    }
    seen.add(w.health_id);

    const key = disciplineKey(w.activity);
    const gap = (e: ExistingWorkout) => (e.time ? Math.abs(minutes(e.time) - minutes(w.time)) : 24 * 60);
    const [match] = existing
      .filter((e) => !e.deleted_at && !e.health_id && !taken.has(e.id) && e.date === w.date && disciplineKey(e.activity) === key)
      // Prima quelli ancora da fare, poi il più vicino per orario.
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || gap(a) - gap(b));

    const { ended_at, ...measured } = w;
    if (!match) {
      plan.create.push({ ...measured, status: "done", completed_at: ended_at, source: "health" });
      continue;
    }
    taken.add(match.id);
    plan.complete.push({
      id: match.id,
      // Il nome scelto nell'app resta; le misure di Salute si aggiungono solo dove ci sono.
      patch: withoutNulls({
        status: "done",
        health_id: w.health_id,
        completed_at: match.status === "done" ? null : ended_at,
        time: match.time ? null : w.time,
        duration_min: w.duration_min,
        distance_m: w.distance_m,
        energy_kcal: w.energy_kcal,
        avg_hr: w.avg_hr,
      }),
    });
  }
  return plan;
}

/** La frase che il Comando rapido può mostrare a fine invio. */
export function importMessage(plan: HealthPlan, rejected = 0): string {
  const done = plan.complete.length;
  const added = plan.create.length;
  const parts = [
    done ? (done === 1 ? "1 completato" : `${done} completati`) : "",
    added ? (added === 1 ? "1 aggiunto" : `${added} aggiunti`) : "",
    rejected ? (rejected === 1 ? "1 non letto" : `${rejected} non letti`) : "",
  ].filter(Boolean);
  return parts.length ? `Allenamenti: ${parts.join(", ")}.` : "Nessun allenamento nuovo.";
}
