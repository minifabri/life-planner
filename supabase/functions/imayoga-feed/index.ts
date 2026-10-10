// Edge Function: porta di accesso in sola lettura alle lezioni di imayoga (technical-design.md, 9.2).
// Autenticazione: il token dell'utente. Indirizzo, chiave pubblica e token del feed stanno in Vault
// (segreto `imayoga:<owner_id>`) e non arrivano mai al client. Verso imayoga parte una sola chiamata, a `planner_feed`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_HOST = /^[a-z0-9]+\.supabase\.co$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMEOUT_MS = 20_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FeedConfig = { url: string; api_key: string; token: string };

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
  const from = String(input.from ?? "");
  const to = String(input.to ?? "");
  if (!DATE.test(from) || !DATE.test(to)) return json({ error: "richiesta non valida" }, 400);

  const { data: rows, error } = await db.rpc("imayoga_get_feed_config", { p_owner: owner });
  if (error) return json({ error: error.message }, 500);
  const config = (Array.isArray(rows) ? rows[0] : rows) as FeedConfig | undefined;
  if (!config?.token) return json({ error: "not_configured" });

  let url: URL;
  try {
    url = new URL("/rest/v1/rpc/planner_feed", config.url);
  } catch {
    return json({ error: "not_configured" });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) return json({ error: "not_configured" });

  try {
    const res = await fetch(url, {
      method: "POST",
      // I redirect non si seguono: il token non deve arrivare a un host diverso da quello controllato.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", apikey: config.api_key },
      body: JSON.stringify({ p_token: config.token, p_from: from, p_to: to }),
    });
    if (res.status === 401 || res.status === 403) return json({ error: "invalid_token" });
    if (res.status !== 200) return json({ error: "imayoga_unreachable", status: res.status });
    const items = await res.json();
    if (!Array.isArray(items)) return json({ error: "imayoga_unreachable" });
    return json({ ok: true, items });
  } catch {
    return json({ error: "imayoga_unreachable" });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
