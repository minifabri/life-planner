// Edge Function: invia le notifiche push dovute.
// Invocata ogni minuto da pg_cron (vedi migrazione cron_dispatch). Autenticazione: header x-cron-secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = 50;
const MAX_ATTEMPTS = 5;

type Reminder = {
  id: string;
  owner_id: string;
  target_type: string;
  title_snapshot: string | null;
  body_snapshot: string | null;
  url: string | null;
  attempts: number;
};

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req: Request) => {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: cfgRows, error: cfgError } = await db.rpc("get_dispatch_config");
  const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows;
  if (cfgError || !cfg?.cron_secret || !cfg?.vapid_private_key) {
    return json({ error: "configurazione mancante" }, 500);
  }
  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    return json({ error: "non autorizzato" }, 401);
  }

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public_key, cfg.vapid_private_key);

  const { data: due, error } = await db
    .from("reminders")
    .select("id, owner_id, target_type, title_snapshot, body_snapshot, url, attempts")
    .is("sent_at", null)
    .lte("fire_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("fire_at")
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const r of (due ?? []) as Reminder[]) {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("owner_id", r.owner_id);

    if (!subs || subs.length === 0) {
      await db.from("reminders").update({ attempts: r.attempts + 1, last_error: "nessuna subscription" }).eq("id", r.id);
      failed++;
      continue;
    }

    const payload = JSON.stringify({
      title: r.title_snapshot ?? "Planner",
      body: r.body_snapshot ?? "",
      url: r.url ?? "/today",
      tag: r.id,
    });

    let delivered = false;
    let lastError: string | null = null;
    for (const s of subs as Subscription[]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60,
          urgency: "normal",
        });
        delivered = true;
        await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        lastError = `${status ?? "?"} ${(e as Error).message}`;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }

    if (delivered) {
      await db.from("reminders").update({ sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null }).eq("id", r.id);
      sent++;
    } else {
      await db.from("reminders").update({ attempts: r.attempts + 1, last_error: lastError }).eq("id", r.id);
      failed++;
    }
  }

  return json({ checked: due?.length ?? 0, sent, failed });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
