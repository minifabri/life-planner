import { localDateString } from "../dates/today";
import { deterministicId, uuidv7 } from "../ids";
import type { ExceptionInput } from "../import/ics";
import { getSupabase } from "../supabase/client";
import type { GcalCalendar } from "../supabase/types";
import { feedEvents, planFeedSync, type FeedEvent, type LocalFeedEvent } from "./feed";

/** All'apertura dell'app la sync parte al massimo ogni 10 minuti. */
export const SYNC_INTERVAL_MS = 10 * 60_000;
const PAGE = 1000;
const WRITE_CHUNK = 200;

export type GcalErrorCode = "invalid_url" | "not_connected" | "google_unreachable" | "network";

export class GcalError extends Error {
  constructor(public code: GcalErrorCode) {
    super(code);
  }
}

/** Testo da mostrare per un errore di collegamento o di sync. */
export function gcalErrorMessage(error: unknown): string {
  const code = error instanceof GcalError ? error.code : "network";
  if (code === "invalid_url") {
    return "Indirizzo non valido o non più attivo. Copia di nuovo l’“Indirizzo segreto in formato iCal” da Google Calendar.";
  }
  if (code === "not_connected") return "Questo calendario Google non è collegato.";
  if (code === "google_unreachable") return "Google Calendar non risponde in questo momento. Riprova tra poco.";
  return "Operazione non riuscita. Controlla la connessione e riprova.";
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

type GatewayReply = { ok?: boolean; error?: string; id?: string; body?: string };

async function gateway(body: object): Promise<GatewayReply> {
  const { data, error } = await getSupabase().functions.invoke<GatewayReply>("gcal-ics", { body });
  if (error || !data) throw new GcalError("network");
  if (data.error === "invalid_url" || data.error === "not_connected" || data.error === "google_unreachable") {
    throw new GcalError(data.error);
  }
  if (data.error) throw new GcalError("network");
  return data;
}

/** Collega un calendario dal suo indirizzo segreto: il server lo verifica e lo custodisce. */
export async function connectGcal(url: string): Promise<void> {
  await gateway({ action: "connect", url });
}

/** Scollega un calendario: indirizzo ed eventi spariscono dall'app, su Google non cambia nulla. */
export async function disconnectGcal(calendarId: string): Promise<void> {
  await gateway({ action: "disconnect", calendar: calendarId });
}

export async function fetchGcalCalendars(): Promise<GcalCalendar[]> {
  return check(
    await getSupabase()
      .from("gcal_calendars")
      .select("id, gcal_calendar_id, summary, last_synced_at, last_error")
      .order("created_at"),
  );
}

async function localEvents(calendarId: string): Promise<LocalFeedEvent[]> {
  const out: LocalFeedEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const page: LocalFeedEvent[] = check(
      await getSupabase()
        .from("events")
        .select("id, gcal_etag, rrule, all_day, start_date, end_date, start_at, end_at, tz")
        .eq("source", "gcal")
        .eq("gcal_calendar_id", calendarId)
        .is("deleted_at", null)
        .order("id")
        .range(from, from + PAGE - 1),
    );
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SyncResult = { updated: number; removed: number };

async function syncCalendar(calendar: GcalCalendar, tz: string, now: Date): Promise<SyncResult> {
  const supabase = getSupabase();
  const today = localDateString(now, tz);
  const reply = await gateway({ action: "fetch", calendar: calendar.id });

  // L'id deriva dall'UID, come nell'import da file e in iCloud: un evento già importato viene collegato, non duplicato.
  const wanted = new Map<string, FeedEvent>();
  for (const e of feedEvents(reply.body ?? "", tz, today)) wanted.set(await deterministicId(`ics:${e.uid}`), e);
  const local = await localEvents(calendar.gcal_calendar_id);
  const plan = planFeedSync(
    [...wanted].map(([id, e]) => ({ id, hash: e.hash })),
    local,
    today,
  );

  const rows = plan.write.map((id) => {
    const e = wanted.get(id)!;
    return {
      id,
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
      kind: e.kind,
      source: "gcal",
      gcal_calendar_id: calendar.gcal_calendar_id,
      gcal_event_id: e.uid,
      gcal_etag: e.hash,
      icloud_calendar_id: null,
      icloud_href: null,
      icloud_etag: null,
      deleted_at: null,
    };
  });
  for (const part of chunks(rows, WRITE_CHUNK)) {
    check(await supabase.from("events").upsert(part, { onConflict: "id" }).select("id"));
  }
  for (const part of chunks(plan.write, WRITE_CHUNK)) {
    check(await supabase.from("event_exceptions").delete().in("event_id", part).select("id"));
  }
  const exceptionRows = plan.write.flatMap((eventId) =>
    wanted.get(eventId)!.exceptions.map((ex: ExceptionInput) => ({ id: uuidv7(), event_id: eventId, ...ex })),
  );
  for (const part of chunks(exceptionRows, WRITE_CHUNK)) {
    check(await supabase.from("event_exceptions").insert(part).select("id"));
  }
  for (const part of chunks(plan.remove, WRITE_CHUNK)) {
    check(await supabase.from("events").update({ deleted_at: now.toISOString() }).in("id", part).select("id"));
  }

  check(
    await supabase
      .from("gcal_calendars")
      .update({ last_synced_at: now.toISOString(), last_error: null })
      .eq("id", calendar.id)
      .select("id"),
  );
  return { updated: plan.write.length, removed: plan.remove.length };
}

let running: Promise<SyncResult | null> | null = null;

async function run(tz: string): Promise<SyncResult | null> {
  const calendars = await fetchGcalCalendars();
  if (!calendars.length) return null;
  const now = new Date();
  const total: SyncResult = { updated: 0, removed: 0 };
  let failure: unknown = null;
  // Un calendario che non risponde non ferma gli altri.
  for (const calendar of calendars) {
    try {
      const result = await syncCalendar(calendar, tz, now);
      total.updated += result.updated;
      total.removed += result.removed;
    } catch (e) {
      failure ??= e;
      if (e instanceof GcalError && e.code === "invalid_url") {
        await getSupabase().from("gcal_calendars").update({ last_error: e.code }).eq("id", calendar.id);
      }
    }
  }
  if (failure) throw failure;
  return total;
}

/**
 * Porta nell'app gli eventi dei calendari Google collegati. Restituisce null se non ce n'è nessuno.
 * Due richieste contemporanee (apertura dell'app e pulsante) condividono la stessa sync.
 */
export function syncGcal(tz: string): Promise<SyncResult | null> {
  running ??= run(tz).finally(() => {
    running = null;
  });
  return running;
}
