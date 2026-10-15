import { addDays, atLocalTime, diffDays, localTimeString, weekStart, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import { eventsForDay, type Occurrence } from "../events/day";
import { splitQuiet } from "../events/kind";
import type { EventException, EventRow, Task, Workout } from "../supabase/types";
import { classifyTask } from "../tasks/classify";
import { dayLoad, type LoadLevel } from "../tasks/load";
import { shownStatus, workoutsOfDay } from "../workouts/summary";

export function weekDays(from: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

export function monthStart(d: LocalDate): LocalDate {
  return `${d.slice(0, 7)}-01`;
}

/** I giorni della griglia del mese: settimane intere dal lunedì, compresi i giorni dei mesi vicini. */
export function monthGrid(month: LocalDate): LocalDate[] {
  const first = monthStart(month);
  const from = weekStart(first);
  const [y, m] = first.split("-").map(Number);
  const lastDay = `${first.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const weeks = Math.ceil((diffDays(lastDay, from) + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(from, i));
}

export type DayView = {
  day: LocalDate;
  /** Eventi dell'agenda; compleanni e spedizioni stanno in `quiet`. */
  occurrences: Occurrence[];
  /** Compleanni e spedizioni: si mostrano in piccolo e non pesano sulla giornata. */
  quiet: Occurrence[];
  /** Attività con orario, in ordine. */
  timed: Task[];
  /** Attività del giorno senza orario (comprese quelle nel periodo arrivate all'ultimo giorno utile). */
  untimed: Task[];
  /** Allenamenti del giorno: prima quelli con orario. */
  workouts: Workout[];
  load: { minutes: number; level: LoadLevel; ratio: number };
};

/** Tutto ciò che cade in un giorno, come lo mostra Today, senza "Rimaste indietro" e "Nel periodo". */
export function buildDay(
  tasks: Task[],
  events: EventRow[],
  exceptions: EventException[],
  day: LocalDate,
  today: LocalDate,
  tz: string = DEFAULT_TZ,
  workouts: Workout[] = [],
): DayView {
  const { regular: occurrences, quiet } = splitQuiet(eventsForDay(events, exceptions, day, tz));
  const timed: Task[] = [];
  const untimed: Task[] = [];
  for (const t of tasks) {
    const section = classifyTask(t, day, today, tz);
    if (section === "agenda") timed.push(t);
    else if (section === "todo") untimed.push(t);
  }
  timed.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  untimed.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.created_at.localeCompare(b.created_at));
  const ofDay = workoutsOfDay(workouts, day);
  const load = dayLoad([
    ...occurrences.map((o) => o.durationMin),
    ...[...timed, ...untimed].filter((t) => t.status === "open").map((t) => t.duration_min),
    ...ofDay.filter((w) => shownStatus(w, today) === "planned").map((w) => w.duration_min),
  ]);
  return { day, occurrences, quiet, timed, untimed, workouts: ofDay, load };
}

export type Highlight = {
  key: string;
  time: string | null;
  title: string;
  kind: "event" | "task" | "workout";
  important: boolean;
  /** Attività nel periodo arrivata all'ultimo giorno utile. */
  deadline: boolean;
  done: boolean;
  areaId: string | null;
};

function taskHighlight(t: Task, day: LocalDate): Highlight {
  return {
    key: t.id,
    time: t.time ? t.time.slice(0, 5) : null,
    title: t.title,
    kind: "task",
    important: t.attention === "high",
    deadline: !t.date && t.due_date === day,
    done: t.status === "done",
    areaId: t.area_id,
  };
}

/**
 * Gli elementi principali di un giorno per l'elenco della settimana su mobile:
 * prima ciò che ha un orario, poi le attività importanti, poi il resto. `more` conta quelli rimasti fuori.
 */
export function dayHighlights(view: DayView, max = 3): { items: Highlight[]; more: number } {
  const timed: Highlight[] = [
    ...view.occurrences.map((o) => ({
      key: o.key,
      time: o.startTime,
      title: o.event.title,
      kind: "event" as const,
      important: o.event.attention === "high",
      deadline: false,
      done: false,
      areaId: o.event.area_id,
    })),
    ...view.timed.map((t) => taskHighlight(t, view.day)),
    ...view.workouts.filter((w) => w.time).map(workoutHighlight),
  ].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const untimed: Highlight[] = [
    ...view.untimed.map((t) => taskHighlight(t, view.day)),
    ...view.workouts.filter((w) => !w.time).map(workoutHighlight),
  ].sort((a, b) => Number(a.done) - Number(b.done) || Number(b.important) - Number(a.important));
  const all = [...timed, ...untimed];
  return { items: all.slice(0, max), more: Math.max(0, all.length - max) };
}

function workoutHighlight(w: Workout): Highlight {
  return { key: w.id, time: w.time ? w.time.slice(0, 5) : null, title: w.activity, kind: "workout", important: false, deadline: false, done: w.status === "done", areaId: null };
}

/**
 * Quanto resta libero in un giorno, in poche parole: "giornata libera", "libera dalle 18", "4 h libere".
 * Le ore libere sono quelle che mancano alle otto di una giornata piena.
 */
export function freeLabel(view: DayView): string {
  if (view.load.level === "empty") return "giornata libera";
  if (view.load.level === "light") return "giornata leggera";
  const blocks = timedBlocks(view);
  const lastEnd = blocks.reduce((max, b) => Math.max(max, b.endMin), 0);
  const untimedMin = view.untimed.filter((t) => t.status === "open").reduce((sum, t) => sum + (t.duration_min ?? 0), 0);
  if (blocks.length && !untimedMin && lastEnd <= 18 * 60) {
    const hour = Math.ceil(lastEnd / 60);
    return `libera dalle ${hour}`;
  }
  const free = Math.floor((480 - view.load.minutes) / 60);
  return free >= 1 ? `${free} h libere` : "giornata piena";
}

/** Segni minimi di un giorno nella griglia del mese. Le lezioni (imayoga) hanno un segno a parte e non contano tra gli eventi. */
export type DayMarks = {
  events: number;
  lessons: number;
  tasks: number;
  deadlines: number;
  workouts: number;
  birthdays: number;
  shipments: number;
  important: boolean;
};

export function dayMarks(view: DayView, tasks: Task[]): DayMarks {
  const open = [...view.timed, ...view.untimed].filter((t) => t.status === "open");
  const deadlines = tasks.filter((t) => t.status === "open" && !t.deleted_at && t.due_date === view.day).length;
  const lessons = view.occurrences.filter((o) => o.event.source === "imayoga").length;
  return {
    events: view.occurrences.length - lessons,
    lessons,
    tasks: open.filter((t) => t.due_date !== view.day || t.date !== null).length,
    deadlines,
    workouts: view.workouts.length,
    birthdays: view.quiet.filter((o) => o.event.kind === "birthday").length,
    shipments: view.quiet.filter((o) => o.event.kind === "shipment").length,
    important: open.some((t) => t.attention === "high") || view.occurrences.some((o) => o.event.attention === "high"),
  };
}

/** Attività nel periodo ancora aperte la cui finestra tocca i giorni da `from` a `to` (fascia "Periodo", D33). */
export function periodTasks(tasks: Task[], from: LocalDate, to: LocalDate, today: LocalDate): Task[] {
  return tasks
    .filter((t) => !t.deleted_at && t.status === "open" && !t.date && !!t.due_date && t.due_date >= today && t.due_date >= from)
    .filter((t) => (t.window_start ?? from) <= to)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}

/** Un evento si può spostare di giorno solo se è nato nell'app e non è una serie. */
export function canMoveEvent(event: Pick<EventRow, "source" | "rrule">): boolean {
  return event.source === "app" && !event.rrule;
}

function shiftInstant(iso: string, days: number, tz: string): string {
  const instant = new Date(iso);
  // Si sposta il giorno e si tiene l'ora locale: il cambio dell'ora non sposta l'appuntamento.
  return atLocalTime(addDays(localDateString(instant, tz), days), localTimeString(instant, tz), tz).toISOString();
}

/** Sposta un evento da `fromDay` a `toDay` mantenendo orario e durata. */
export function moveEventPatch(
  event: Pick<EventRow, "all_day" | "start_date" | "end_date" | "start_at" | "end_at" | "tz">,
  fromDay: LocalDate,
  toDay: LocalDate,
): Partial<EventRow> {
  const days = diffDays(toDay, fromDay);
  if (days === 0) return {};
  if (event.all_day) {
    return {
      start_date: event.start_date ? addDays(event.start_date, days) : null,
      end_date: event.end_date ? addDays(event.end_date, days) : null,
    };
  }
  return {
    start_at: event.start_at ? shiftInstant(event.start_at, days, event.tz) : null,
    end_at: event.end_at ? shiftInstant(event.end_at, days, event.tz) : null,
  };
}

export type TimedBlock = { key: string; startMin: number; endMin: number };
export type PlacedBlock<T extends TimedBlock> = T & { lane: number; lanes: number };

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function timeToMinutes(time: string): number {
  return minutes(time);
}

/**
 * Dispone in corsie affiancate i blocchi che si sovrappongono.
 * `minMinutes` è la durata minima disegnata: un blocco corto occupa comunque lo spazio di un bersaglio toccabile.
 */
export function layoutBlocks<T extends TimedBlock>(blocks: T[], minMinutes: number): PlacedBlock<T>[] {
  const sorted = [...blocks]
    .map((b) => ({ ...b, endMin: Math.max(b.endMin, b.startMin + minMinutes) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: PlacedBlock<T>[] = [];
  let group: PlacedBlock<T>[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = group.reduce((max, b) => Math.max(max, b.lane + 1), 0);
    for (const b of group) b.lanes = lanes;
    out.push(...group);
    group = [];
  };
  for (const block of sorted) {
    if (group.length && block.startMin >= groupEnd) close();
    const taken = new Set(group.filter((b) => b.endMin > block.startMin).map((b) => b.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    group.push({ ...block, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, block.endMin);
  }
  if (group.length) close();
  return out;
}

/** Le ore da mostrare nella griglia: dalle 8 alle 20, allargate a ciò che c'è in settimana. */
export function hourRange(blocks: TimedBlock[]): { startHour: number; endHour: number } {
  let startHour = 8;
  let endHour = 20;
  for (const b of blocks) {
    startHour = Math.min(startHour, Math.floor(b.startMin / 60));
    endHour = Math.max(endHour, Math.min(24, Math.ceil(b.endMin / 60)));
  }
  return { startHour, endHour };
}

/** I blocchi con orario di un giorno: eventi (non di tutto il giorno), attività e allenamenti con orario. */
export function timedBlocks(view: DayView): (TimedBlock & { occurrence?: Occurrence; task?: Task; workout?: Workout })[] {
  return [
    ...view.occurrences
      .filter((o) => !o.allDay && o.startTime)
      .map((o) => {
        const startMin = minutes(o.startTime!);
        return { key: o.key, startMin, endMin: Math.min(24 * 60, startMin + (o.durationMin ?? 0)), occurrence: o };
      }),
    ...view.timed.map((t) => {
      const startMin = minutes(t.time!.slice(0, 5));
      return { key: t.id, startMin, endMin: Math.min(24 * 60, startMin + (t.duration_min ?? 0)), task: t };
    }),
    ...view.workouts
      .filter((w) => w.time)
      .map((w) => {
        const startMin = minutes(w.time!.slice(0, 5));
        return { key: w.id, startMin, endMin: Math.min(24 * 60, startMin + (w.duration_min ?? 0)), workout: w };
      }),
  ];
}
