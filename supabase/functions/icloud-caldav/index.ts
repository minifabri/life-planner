// Edge Function: porta di accesso in sola lettura al CalDAV di iCloud (technical-design.md, 9.6).
// Il client decide cosa chiedere (lib/icloud/caldav.ts); qui si aggiungono le credenziali custodite in Vault.
// Autenticazione: il token dell'utente. Verso iCloud passano solo PROPFIND e REPORT, quindi nessuna scrittura.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ICLOUD_ROOT = "https://caldav.icloud.com/";
const ALLOWED_HOST = /^(caldav|p\d+-caldav)\.icloud\.com$/;
const ALLOWED_METHODS = ["PROPFIND", "REPORT"];
const TIMEOUT_MS = 20_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRINCIPAL_BODY =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';

type Credentials = { apple_id: string; password: string };

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
    const appleId = String(input.appleId ?? "").trim();
    const password = String(input.password ?? "").trim();
    if (!appleId || !password) return json({ error: "missing_credentials" });
    const check = await caldav({ apple_id: appleId, password }, "PROPFIND", ICLOUD_ROOT, "0", PRINCIPAL_BODY);
    if (check.status === 401 || check.status === 403) return json({ error: "invalid_credentials" });
    if (check.status !== 207) return json({ error: "icloud_unreachable", status: check.status });
    const saved = await db.rpc("icloud_set_credentials", { p_owner: owner, p_apple_id: appleId, p_password: password });
    if (saved.error) return json({ error: saved.error.message }, 500);
    const account = await db
      .from("icloud_accounts")
      .upsert({ owner_id: owner, apple_id: appleId, home_url: null, last_error: null }, { onConflict: "owner_id" });
    if (account.error) return json({ error: account.error.message }, 500);
    return json({ ok: true });
  }

  if (input.action === "disconnect") {
    // I calendari portano via con sé i loro eventi (on delete cascade).
    const removed = await db.rpc("icloud_delete_credentials", { p_owner: owner });
    if (removed.error) return json({ error: removed.error.message }, 500);
    await db.from("icloud_calendars").delete().eq("owner_id", owner);
    await db.from("icloud_accounts").delete().eq("owner_id", owner);
    return json({ ok: true });
  }

  if (input.action === "dav") {
    const method = String(input.method ?? "");
    const depth = input.depth === "1" ? "1" : "0";
    let url: URL;
    try {
      url = new URL(String(input.url ?? ""));
    } catch {
      return json({ error: "richiesta non valida" }, 400);
    }
    if (!ALLOWED_METHODS.includes(method) || url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) {
      return json({ error: "richiesta non consentita" }, 400);
    }
    const { data: rows, error } = await db.rpc("icloud_get_credentials", { p_owner: owner });
    const credentials = (Array.isArray(rows) ? rows[0] : rows) as Credentials | undefined;
    if (error) return json({ error: error.message }, 500);
    if (!credentials?.password) return json({ error: "not_connected" });
    const result = await caldav(credentials, method, url.toString(), depth, String(input.body ?? ""));
    return json(result);
  }

  return json({ error: "richiesta non valida" }, 400);
});

async function caldav(credentials: Credentials, method: string, url: string, depth: string, body: string) {
  try {
    const res = await fetch(url, {
      method,
      // I redirect non si seguono: le credenziali non devono arrivare a un host diverso da quello controllato.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${basic(`${credentials.apple_id}:${credentials.password}`)}`,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: depth,
      },
      body,
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
}

function basic(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
