import { addDays } from "../dates/local";
import { localDateString } from "../dates/today";
import { deterministicId } from "../ids";
import { getSupabase } from "../supabase/client";
import type { ImayogaAccount } from "../supabase/types";
import { IMAYOGA_TZ, planSync, toLessonEvents, type FeedItem, type LocalLesson, type SyncPlan, type WantedLesson } from "./map";
import { followLessons, type PrepTask } from "./prep";

/** Periodo letto da imayoga: da 30 giorni fa a 12 mesi avanti. */
const WINDOW_BACK_DAYS = 30;
const WINDOW_AHEAD_DAYS = 365;
/** All'apertura dell'app la sync parte al massimo ogni 10 minuti. */
export const SYNC_INTERVAL_MS = 10 * 60_000;
/** Area assegnata alle lezioni quando entrano nel planner; poi la sync non la tocca più. */
const TEACHING_AREA = "Insegnamento yoga";

export type ImayogaErrorCode = "not_configured" | "invalid_token" | "imayoga_unreachable" | "network";

export class ImayogaError extends Error {
  constructor(public code: ImayogaErrorCode) {
    super(code);
  }
}

/** Testo da mostrare per un errore di collegamento o di sync. */
export function imayogaErrorMessage(error: unknown): string {
  const code = error instanceof ImayogaError ? error.code : "network";
  if (code === "not_configured") return "Le lezioni di imayoga non sono disponibili per questo account.";
  if (code === "invalid_token") return "imayoga ha rifiutato l’accesso: il collegamento va configurato di nuovo.";
  if (code === "imayoga_unreachable") return "imayoga non risponde in questo momento. Riprova tra poco.";
  return "Operazione non riuscita. Controlla la connessione e riprova.";
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

type FeedReply = { ok?: boolean; error?: string; items?: FeedItem[] };

async function fetchFeed(from: string, to: string): Promise<FeedItem[]> {
  const { data, error } = await getSupabase().functions.invoke<FeedReply>("imayoga-feed", { body: { from, to } });
  if (error || !data) throw new ImayogaError("network");
  if (data.error === "not_configured" || data.error === "invalid_token" || data.error === "imayoga_unreachable") {
    throw new ImayogaError(data.error);
  }
  if (data.error || !Array.isArray(data.items)) throw new ImayogaError("network");
  return data.items;
}

export async function fetchImayogaAccount(): Promise<ImayogaAccount | null> {
  return check(await getSupabase().from("imayoga_accounts").select("owner_id, last_synced_at, last_error").maybeSingle());
}

/** Inizia a seguire le lezioni di imayoga. La prima sync la fa chi chiama. */
export async function connectImayoga(): Promise<void> {
  check(await getSupabase().from("imayoga_accounts").upsert({ last_error: null }, { onConflict: "owner_id" }).select("owner_id"));
}

/** Smette di seguire le lezioni: gli eventi arrivati da imayoga spariscono dall'app. */
export async function disconnectImayoga(): Promise<void> {
  const supabase = getSupabase();
  check(
    await supabase
      .from("events")
      .update({ deleted_at: new Date().toISOString() })
      .eq("source", "imayoga")
      .is("deleted_at", null)
      .select("id"),
  );
  // Senza le lezioni non restano preparazioni da fare.
  check(
    await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("source", "lesson")
      .eq("status", "open")
      .is("deleted_at", null)
      .select("id"),
  );
  check(await supabase.from("imayoga_accounts").delete().not("owner_id", "is", null).select("owner_id"));
}

async function teachingAreaId(): Promise<string | null> {
  const rows: { id: string }[] = check(
    await getSupabase().from("areas").select("id").eq("name", TEACHING_AREA).is("archived_at", null).limit(1),
  );
  return rows[0]?.id ?? null;
}

function eventFields(w: WantedLesson) {
  return {
    id: w.id,
    title: w.title,
    location: w.location,
    start_at: w.start_at,
    end_at: w.end_at,
    all_day: false,
    start_date: null,
    end_date: null,
    tz: w.tz,
    rrule: null,
    source: "imayoga" as const,
    lesson: w.lesson,
    deleted_at: null,
  };
}

/** Le preparazioni ancora aperte seguono la lezione: spariscono con lei e si spostano se cambia giorno. */
async function syncPrepTasks(local: LocalLesson[], plan: SyncPlan, today: string, now: string): Promise<number> {
  const touched = [...plan.remove, ...plan.update.map((w) => w.id)];
  if (!touched.length) return 0;
  const supabase = getSupabase();
  const tasks: PrepTask[] = check(
    await supabase
      .from("tasks")
      .select("id, event_id, title, notes, date")
      .eq("source", "lesson")
      .eq("status", "open")
      .is("deleted_at", null)
      .in("event_id", touched),
  );
  const follow = followLessons(tasks, local, plan.update, plan.remove, today);
  if (follow.remove.length) {
    check(await supabase.from("tasks").update({ deleted_at: now }).in("id", follow.remove).select("id"));
  }
  for (const { id, patch } of follow.update) {
    check(await supabase.from("tasks").update(patch).eq("id", id).select("id"));
  }
  return follow.remove.length + follow.update.length;
}

export type SyncResult = { updated: number; removed: number; tasks: number };

let running: Promise<SyncResult | null> | null = null;

async function run(): Promise<SyncResult | null> {
  const account = await fetchImayogaAccount();
  if (!account) return null;
  const supabase = getSupabase();
  const now = new Date();
  try {
    const today = localDateString(now, IMAYOGA_TZ);
    const windowStart = addDays(today, -WINDOW_BACK_DAYS);
    const feed = await fetchFeed(windowStart, addDays(today, WINDOW_AHEAD_DAYS));
    const wanted: WantedLesson[] = await Promise.all(
      toLessonEvents(feed).map(async (lesson) => ({ ...lesson, id: await deterministicId(lesson.key) })),
    );
    const local: LocalLesson[] = check(
      await supabase.from("events").select("id, title, location, start_at, end_at, lesson, deleted_at").eq("source", "imayoga"),
    );
    const plan = planSync(local, wanted, windowStart);

    if (plan.create.length) {
      const area_id = await teachingAreaId();
      check(
        await supabase
          .from("events")
          .upsert(
            plan.create.map((w) => ({ ...eventFields(w), area_id })),
            { onConflict: "id" },
          )
          .select("id"),
      );
    }
    // Area e attenzione restano fuori: se scelte nell'app non vengono riscritte dalla sync.
    if (plan.update.length) {
      check(await supabase.from("events").upsert(plan.update.map(eventFields), { onConflict: "id" }).select("id"));
    }
    if (plan.remove.length) {
      check(await supabase.from("events").update({ deleted_at: now.toISOString() }).in("id", plan.remove).select("id"));
    }
    const tasks = await syncPrepTasks(local, plan, today, now.toISOString());
    await supabase.from("imayoga_accounts").update({ last_synced_at: now.toISOString(), last_error: null }).eq("owner_id", account.owner_id);
    return { updated: plan.create.length + plan.update.length, removed: plan.remove.length, tasks };
  } catch (e) {
    if (e instanceof ImayogaError && (e.code === "invalid_token" || e.code === "not_configured")) {
      await supabase.from("imayoga_accounts").update({ last_error: e.code }).eq("owner_id", account.owner_id);
    }
    throw e;
  }
}

/**
 * Porta nell'app le lezioni pubblicate su imayoga. Restituisce null se le lezioni non sono seguite.
 * Due richieste contemporanee (apertura dell'app e pulsante) condividono la stessa sync.
 */
export function syncImayoga(): Promise<SyncResult | null> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}
