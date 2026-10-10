import { atLocalTime, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";

/** Le lezioni di imayoga hanno solo l'ora di inizio: durano un'ora (D11). */
export const LESSON_MINUTES = 60;
/** Gli orari di imayoga sono sempre quelli italiani, qualunque sia il fuso del profilo. */
export const IMAYOGA_TZ = DEFAULT_TZ;

/** Una riga del feed `planner_feed` di imayoga: una lezione pubblicata o un evento pubblicato. */
export type FeedItem = {
  kind: "class" | "event";
  id: string;
  starts_on: LocalDate;
  starts_at: string;
  title: string | null;
  level_name: string | null;
  location: string | null;
  is_individual: boolean;
  booked_count: number;
  assigned: boolean;
};

export type LessonEvent = {
  /** Nome da cui deriva l'id dell'evento nel planner: la stessa lezione ha sempre lo stesso id. */
  key: string;
  title: string;
  location: string | null;
  start_at: string;
  end_at: string;
  tz: string;
};

/** Uno slot individuale che nessuno ha prenotato non è un impegno: resta fuori dal planner. */
export function isEmptyIndividualSlot(item: FeedItem): boolean {
  return item.kind === "class" && item.is_individual && item.booked_count === 0 && !item.assigned;
}

/** Il titolo di una lezione individuale non riporta il nome dell'allieva. */
export function lessonTitle(item: FeedItem): string {
  if (item.kind === "event") return item.title?.trim() || "Evento imayoga";
  if (item.is_individual) return "Lezione individuale";
  return [item.title, item.level_name].map((part) => part?.trim()).filter(Boolean).join(" · ") || "Lezione di yoga";
}

/** Feed di imayoga → eventi del planner. Le righe con data o ora illeggibili vengono saltate. */
export function toLessonEvents(items: FeedItem[]): LessonEvent[] {
  const out: LessonEvent[] = [];
  for (const item of items) {
    if (isEmptyIndividualSlot(item)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.starts_on) || !/^\d{2}:\d{2}/.test(item.starts_at)) continue;
    const start = atLocalTime(item.starts_on, item.starts_at, IMAYOGA_TZ);
    out.push({
      key: `imayoga:${item.kind}:${item.id}`,
      title: lessonTitle(item),
      location: item.location?.trim() || null,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + LESSON_MINUTES * 60_000).toISOString(),
      tz: IMAYOGA_TZ,
    });
  }
  return out;
}

export type LocalLesson = {
  id: string;
  title: string;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  deleted_at: string | null;
};

export type WantedLesson = LessonEvent & { id: string };

export type SyncPlan = {
  /** Lezioni che il planner non ha mai visto. */
  create: WantedLesson[];
  /** Lezioni cambiate su imayoga, o tornate dopo essere sparite. */
  update: WantedLesson[];
  /** Id degli eventi da togliere: la lezione non è più nel feed. */
  remove: string[];
};

function sameInstant(a: string | null, b: string): boolean {
  return !!a && new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Confronta il feed con gli eventi imayoga già nel planner.
 * Una lezione che il feed non elenca più viene tolta, tranne quando è iniziata prima di `windowStart`
 * (il primo giorno del periodo chiesto): in quel caso è solo uscita dal periodo e resta come storico.
 */
export function planSync(local: LocalLesson[], wanted: WantedLesson[], windowStart: LocalDate): SyncPlan {
  const byId = new Map(local.map((l) => [l.id, l]));
  const plan: SyncPlan = { create: [], update: [], remove: [] };
  for (const w of wanted) {
    const l = byId.get(w.id);
    if (!l) plan.create.push(w);
    else if (
      l.deleted_at ||
      l.title !== w.title ||
      l.location !== w.location ||
      !sameInstant(l.start_at, w.start_at) ||
      !sameInstant(l.end_at, w.end_at)
    ) {
      plan.update.push(w);
    }
  }
  const wantedIds = new Set(wanted.map((w) => w.id));
  for (const l of local) {
    if (l.deleted_at || wantedIds.has(l.id)) continue;
    const past = !!l.start_at && localDateString(new Date(l.start_at), IMAYOGA_TZ) < windowStart;
    if (!past) plan.remove.push(l.id);
  }
  return plan;
}
