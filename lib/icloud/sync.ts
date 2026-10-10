import { addDays, startOfLocalDay } from "../dates/local";
import { localDateString } from "../dates/today";
import { deterministicId, uuidv7 } from "../ids";
import { parseIcs, toEventInput, toExceptionInputs, type ExceptionInput } from "../import/ics";
import { getSupabase } from "../supabase/client";
import type { EventRow, IcloudAccount, IcloudCalendar } from "../supabase/types";
import {
  calendarsRequest,
  diffEtags,
  etagsRequest,
  homeSetRequest,
  ICLOUD_CALDAV_URL,
  isPastWindow,
  multigetRequest,
  parseCalendars,
  parseEtags,
  parseEvents,
  parseHomeSetUrl,
  parsePrincipalUrl,
  principalRequest,
  type DavRequest,
  type RemoteCalendar,
} from "./caldav";

/** Periodo letto da iCloud: da 30 giorni fa a 12 mesi avanti. */
const WINDOW_BACK_DAYS = 30;
const WINDOW_AHEAD_DAYS = 365;
/** All'apertura dell'app la sync parte al massimo ogni 10 minuti. */
export const SYNC_INTERVAL_MS = 10 * 60_000;
const MULTIGET_CHUNK = 40;
const PAGE = 1000;
const WRITE_CHUNK = 200;

export type IcloudErrorCode = "invalid_credentials" | "not_connected" | "icloud_unreachable" | "network";

export class IcloudError extends Error {
  constructor(public code: IcloudErrorCode) {
    super(code);
  }
}

/** Testo da mostrare per un errore di collegamento o di sync. */
export function icloudErrorMessage(error: unknown): string {
  const code = error instanceof IcloudError ? error.code : "network";
  if (code === "invalid_credentials") {
    return "Apple ID o password per app non validi. Serve una password specifica per le app, non quella dell’account.";
  }
  if (code === "not_connected") return "Il calendario iCloud non è collegato.";
  if (code === "icloud_unreachable") return "iCloud non risponde in questo momento. Riprova tra poco.";
  return "Operazione non riuscita. Controlla la connessione e riprova.";
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

type GatewayReply = { ok?: boolean; error?: string; status?: number; body?: string };

async function gateway(body: object): Promise<GatewayReply> {
  const { data, error } = await getSupabase().functions.invoke<GatewayReply>("icloud-caldav", { body });
  if (error || !data) throw new IcloudError("network");
  if (data.error === "invalid_credentials" || data.error === "not_connected" || data.error === "icloud_unreachable") {
    throw new IcloudError(data.error);
  }
  if (data.error) throw new IcloudError("network");
  return data;
}

async function dav(request: DavRequest): Promise<string> {
  const reply = await gateway({ action: "dav", ...request });
  // 401: la password per app è stata revocata da Apple.
  if (reply.status === 401 || reply.status === 403) throw new IcloudError("invalid_credentials");
  if (reply.status !== 207 && reply.status !== 200) throw new IcloudError("icloud_unreachable");
  return reply.body ?? "";
}

export async function connectIcloud(appleId: string, password: string): Promise<void> {
  await gateway({ action: "connect", appleId, password });
}

/** Scollega l'account: credenziali, calendari ed eventi iCloud vengono rimossi dall'app. */
export async function disconnectIcloud(): Promise<void> {
  await gateway({ action: "disconnect" });
}

export async function fetchIcloudAccount(): Promise<IcloudAccount | null> {
  return check(
    await getSupabase().from("icloud_accounts").select("owner_id, apple_id, home_url, last_synced_at, last_error").maybeSingle(),
  );
}

export async function fetchIcloudCalendars(): Promise<IcloudCalendar[]> {
  return check(
    await getSupabase().from("icloud_calendars").select("id, url, name, color, selected, ctag, last_synced_at").order("name"),
  );
}

async function homeUrl(account: IcloudAccount): Promise<string> {
  if (account.home_url) return account.home_url;
  const principal = parsePrincipalUrl(await dav(principalRequest()), ICLOUD_CALDAV_URL);
  if (!principal) throw new IcloudError("icloud_unreachable");
  const home = parseHomeSetUrl(await dav(homeSetRequest(principal)), principal);
  if (!home) throw new IcloudError("icloud_unreachable");
  check(await getSupabase().from("icloud_accounts").update({ home_url: home }).eq("owner_id", account.owner_id).select("owner_id"));
  return home;
}

type CalendarState = { calendar: IcloudCalendar; remote: RemoteCalendar };

/** Allinea l'elenco dei calendari a quello di iCloud; la scelta di quali seguire resta com'è. */
async function loadCalendars(account: IcloudAccount): Promise<CalendarState[]> {
  const supabase = getSupabase();
  const home = await homeUrl(account);
  const remote = parseCalendars(await dav(calendarsRequest(home)), home);
  if (remote.length) {
    check(
      await supabase
        .from("icloud_calendars")
        .upsert(
          remote.map((r) => ({ url: r.url, name: r.name, color: r.color })),
          { onConflict: "owner_id,url" },
        )
        .select("id"),
    );
  }
  const saved = await fetchIcloudCalendars();
  const byUrl = new Map(remote.map((r) => [r.url, r]));
  const gone = saved.filter((c) => !byUrl.has(c.url)).map((c) => c.id);
  if (gone.length) check(await supabase.from("icloud_calendars").delete().in("id", gone).select("id"));
  return saved.flatMap((calendar) => {
    const r = byUrl.get(calendar.url);
    return r ? [{ calendar, remote: r }] : [];
  });
}

/** Rilegge da iCloud l'elenco dei calendari. */
export async function refreshIcloudCalendars(): Promise<IcloudCalendar[]> {
  const account = await fetchIcloudAccount();
  if (!account) throw new IcloudError("not_connected");
  return (await loadCalendars(account)).map((s) => ({ ...s.calendar, name: s.remote.name, color: s.remote.color }));
}

/** Segue o smette di seguire un calendario. Gli eventi di un calendario non più seguito spariscono dall'app. */
export async function setIcloudCalendarSelected(id: string, selected: boolean): Promise<void> {
  const supabase = getSupabase();
  check(await supabase.from("icloud_calendars").update({ selected, ctag: null, last_synced_at: null }).eq("id", id).select("id"));
  if (!selected) {
    check(
      await supabase
        .from("events")
        .update({ deleted_at: new Date().toISOString() })
        .eq("icloud_calendar_id", id)
        .is("deleted_at", null)
        .select("id"),
    );
  }
}

type LocalEvent = Pick<
  EventRow,
  "id" | "icloud_href" | "icloud_etag" | "rrule" | "all_day" | "start_date" | "end_date" | "start_at" | "end_at" | "tz"
>;

async function localEvents(calendarId: string): Promise<LocalEvent[]> {
  const out: LocalEvent[] = [];
  for (let from = 0; ; from += PAGE) {
    const page: LocalEvent[] = check(
      await getSupabase()
        .from("events")
        .select("id, icloud_href, icloud_etag, rrule, all_day, start_date, end_date, start_at, end_at, tz")
        .eq("icloud_calendar_id", calendarId)
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

async function softDeleteEvents(ids: string[]): Promise<void> {
  for (const part of chunks(ids, WRITE_CHUNK)) {
    check(await getSupabase().from("events").update({ deleted_at: new Date().toISOString() }).in("id", part).select("id"));
  }
}

export type SyncResult = { updated: number; removed: number };

async function syncCalendar({ calendar, remote }: CalendarState, tz: string, now: Date): Promise<SyncResult> {
  const supabase = getSupabase();
  const today = localDateString(now, tz);
  // Il periodo scorre con i giorni: una volta al giorno si rilegge anche se su iCloud non è cambiato nulla.
  const syncedToday = !!calendar.last_synced_at && localDateString(new Date(calendar.last_synced_at), tz) === today;
  if (remote.ctag && remote.ctag === calendar.ctag && syncedToday) return { updated: 0, removed: 0 };

  const windowStart = addDays(today, -WINDOW_BACK_DAYS);
  const etags = parseEtags(
    await dav(
      etagsRequest(calendar.url, startOfLocalDay(windowStart, tz), startOfLocalDay(addDays(today, WINDOW_AHEAD_DAYS), tz)),
    ),
    calendar.url,
  );
  const local = await localEvents(calendar.id);
  const { changed, removed } = diffEtags(
    etags,
    local.map((l) => ({ url: l.icloud_href ?? "", etag: l.icloud_etag })),
  );

  // L'id deriva dall'UID, come nell'import da file: un evento già importato viene collegato, non duplicato.
  const rows = new Map<string, object>();
  const exceptions = new Map<string, ExceptionInput[]>();
  for (const part of chunks(changed, MULTIGET_CHUNK)) {
    for (const resource of parseEvents(await dav(multigetRequest(calendar.url, part)), calendar.url)) {
      for (const item of parseIcs(resource.ics, tz).items) {
        if (item.kind !== "event") continue;
        const id = await deterministicId(`ics:${item.uid}`);
        // Area e attenzione restano fuori: se scelte nell'app non vengono riscritte dalla sync.
        const e = toEventInput(item);
        rows.set(id, {
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
          source: "icloud",
          icloud_calendar_id: calendar.id,
          icloud_href: resource.url,
          icloud_etag: resource.etag,
          deleted_at: null,
        });
        exceptions.set(id, toExceptionInputs(item));
      }
    }
  }

  const ids = [...rows.keys()];
  for (const part of chunks([...rows.values()], WRITE_CHUNK)) {
    check(await supabase.from("events").upsert(part, { onConflict: "id" }).select("id"));
  }
  for (const part of chunks(ids, WRITE_CHUNK)) {
    check(await supabase.from("event_exceptions").delete().in("event_id", part).select("id"));
  }
  const exceptionRows = ids.flatMap((eventId) => exceptions.get(eventId)!.map((ex) => ({ id: uuidv7(), event_id: eventId, ...ex })));
  for (const part of chunks(exceptionRows, WRITE_CHUNK)) {
    check(await supabase.from("event_exceptions").insert(part).select("id"));
  }

  // Via gli eventi eliminati su iCloud e quelli il cui file ora contiene altro (annullati, UID cambiato).
  const changedUrls = new Set(changed);
  const removedUrls = new Set(removed);
  const stale = local.filter((l) => {
    if (rows.has(l.id)) return false;
    if (changedUrls.has(l.icloud_href ?? "")) return true;
    return removedUrls.has(l.icloud_href ?? "") && !isPastWindow(l, windowStart);
  });
  await softDeleteEvents(stale.map((l) => l.id));

  check(
    await supabase
      .from("icloud_calendars")
      .update({ ctag: remote.ctag, last_synced_at: now.toISOString() })
      .eq("id", calendar.id)
      .select("id"),
  );
  return { updated: ids.length, removed: stale.length };
}

let running: Promise<SyncResult | null> | null = null;

async function run(tz: string): Promise<SyncResult | null> {
  const account = await fetchIcloudAccount();
  if (!account) return null;
  const supabase = getSupabase();
  const now = new Date();
  try {
    const total: SyncResult = { updated: 0, removed: 0 };
    for (const state of await loadCalendars(account)) {
      if (!state.calendar.selected) continue;
      const result = await syncCalendar(state, tz, now);
      total.updated += result.updated;
      total.removed += result.removed;
    }
    await supabase.from("icloud_accounts").update({ last_synced_at: now.toISOString(), last_error: null }).eq("owner_id", account.owner_id);
    return total;
  } catch (e) {
    if (e instanceof IcloudError && e.code === "invalid_credentials") {
      await supabase.from("icloud_accounts").update({ last_error: e.code }).eq("owner_id", account.owner_id);
    }
    throw e;
  }
}

/**
 * Porta nell'app gli eventi dei calendari iCloud seguiti. Restituisce null se l'account non è collegato.
 * Due richieste contemporanee (apertura dell'app e pulsante) condividono la stessa sync.
 */
export function syncIcloud(tz: string): Promise<SyncResult | null> {
  running ??= run(tz).finally(() => {
    running = null;
  });
  return running;
}
