// Edge Function: Google Calendar in sola lettura dall'indirizzo segreto in formato iCal (technical-design.md, 9.1b).
// L'indirizzo vale come una password: si salva in Vault e il client non lo rilegge mai.
// Autenticazione: il token dell'utente. Si scarica solo da calendar.google.com, senza seguire redirect.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Stessa regola di lib/gcal/feed.ts (parseFeedUrl).
const FEED_PATH = /^\/calendar\/ical\/([^/]+)\/(private-[0-9a-f]+)\/basic\.ics$/i;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 15_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo non consentito" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await db.auth.getUser(token);
  const owner = auth?.user?.id;
  if (!owner) return json({ error: "non autorizzato" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "richiesta non valida" }, 400);
  }

  if (input.action === "connect") {
    const feed = parseFeedUrl(String(input.url ?? ""));
    if (!feed) return json({ error: "invalid_url" });
    const download = await fetchFeed(feed.url);
    if (download.status === 404 || download.status === 401 || download.status === 403) return json({ error: "invalid_url" });
    if (download.status !== 200 || !download.body.trimStart().startsWith("BEGIN:VCALENDAR")) {
      return json({ error: "google_unreachable", status: download.status });
    }
    const row = await db
      .from("gcal_calendars")
      .upsert(
        { owner_id: owner, gcal_calendar_id: feed.calendarId, summary: calendarName(download.body), selected: true, last_error: null },
        { onConflict: "owner_id,gcal_calendar_id" },
      )
      .select("id")
      .single();
    if (row.error) return json({ error: row.error.message }, 500);
    const saved = await db.rpc("gcal_set_feed", { p_owner: owner, p_calendar: row.data.id, p_url: feed.url });
    if (saved.error) return json({ error: saved.error.message }, 500);
    return json({ ok: true, id: row.data.id });
  }

  const calendar = String(input.calendar ?? "");
  const found = await db.from("gcal_calendars").select("id, gcal_calendar_id").eq("owner_id", owner).eq("id", calendar).maybeSingle();
  if (found.error) return json({ error: "richiesta non valida" }, 400);
  if (!found.data) return json({ error: "not_connected" });

  if (input.action === "disconnect") {
    const removed = await db.rpc("gcal_delete_feed", { p_owner: owner, p_calendar: calendar });
    if (removed.error) return json({ error: removed.error.message }, 500);
    await db.from("events").delete().eq("owner_id", owner).eq("source", "gcal").eq("gcal_calendar_id", found.data.gcal_calendar_id);
    await db.from("gcal_calendars").delete().eq("id", calendar);
    return json({ ok: true });
  }

  if (input.action === "fetch") {
    const { data: url, error } = await db.rpc("gcal_get_feed", { p_owner: owner, p_calendar: calendar });
    if (error) return json({ error: error.message }, 500);
    if (!url) return json({ error: "not_connected" });
    const download = await fetchFeed(String(url));
    // 404: l'indirizzo segreto è stato reimpostato su Google.
    if (download.status === 404 || download.status === 401 || download.status === 403) return json({ error: "invalid_url" });
    if (download.status !== 200) return json({ error: "google_unreachable", status: download.status });
    return json({ ok: true, body: download.body });
  }

  return json({ error: "richiesta non valida" }, 400);
});

function parseFeedUrl(input: string): { url: string; calendarId: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || url.search || url.hash) return null;
  const m = FEED_PATH.exec(url.pathname);
  if (!m) return null;
  try {
    return { url: url.toString(), calendarId: decodeURIComponent(m[1]) };
  } catch {
    return null;
  }
}

function calendarName(ics: string): string | null {
  const m = /^X-WR-CALNAME:(.*)$/m.exec(ics.replace(/\r\n?/g, "\n"));
  return m?.[1].replace(/\\([,;\\])/g, "$1").trim() || null;
}

async function fetchFeed(url: string): Promise<{ status: number; body: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "calendar.google.com") return { status: 0, body: "" };
  try {
    const res = await fetch(parsed, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status !== 200) return { status: res.status, body: "" };
    const body = await res.text();
    return body.length > MAX_BYTES ? { status: 413, body: "" } : { status: 200, body };
  } catch {
    return { status: 0, body: "" };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
