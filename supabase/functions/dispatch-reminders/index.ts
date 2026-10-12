// Edge Function: calcola e invia le notifiche push dovute (technical-design.md, 7.2).
// Invocata ogni minuto da pg_cron (vedi migrazione cron_dispatch). Autenticazione: header x-cron-secret.
// A ogni giro: 1) dallo stato di attività ed eventi ricava le notifiche degli ultimi minuti e le registra
// in `reminders` (una chiave per notifica, così nessuna parte due volte); 2) invia ciò che è in attesa.
// Le regole stanno in lib/reminders/plan.ts, impacchettato in plan.gen.js da `pnpm build:functions`.
// Con { "dryRun": true } nel corpo risponde con ciò che registrerebbe, senza scrivere né inviare.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { planReminders } from "./plan.gen.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = 50;
const MAX_ATTEMPTS = 5;
/** Minuti all'indietro coperti a ogni giro: assorbe un cron in ritardo o saltato. */
const LOOKBACK_MIN = 10;
const KEEP_DAYS = 30;
const DAY_MS = 86_400_000;
const PROFILE_COLUMNS =
  "display_name, timezone, morning_overview_time, evening_review_time, quiet_start, quiet_end, meal_prep_reminder_time, " +
  "notify_medium, notify_high, quiet_allow_high, notify_meal_prep, notify_morning, notify_evening";
const TASK_COLUMNS =
  "id, title, notes, date, time, due_date, window_start, attention, remind, status, completed_at, original_date, source, deleted_at, created_at, updated_at";

type Db = ReturnType<typeof createClient>;
type Planned = { key: string; targetType: string; targetId: string | null; fireAt: Date; title: string; body: string; url: string };

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

  const input = await req.json().catch(() => ({}));
  const dryRun = input?.dryRun === true;
  const now = dryRun && typeof input.at === "string" ? new Date(input.at) : new Date();
  if (Number.isNaN(now.getTime())) return json({ error: "data non valida" }, 400);
  const from = new Date(now.getTime() - (dryRun && Number(input.minutes) > 0 ? Number(input.minutes) : LOOKBACK_MIN) * 60_000);

  // 1) Notifiche maturate da poco, per chi ha almeno un dispositivo che le riceve.
  const { data: devices, error: devicesError } = await db.from("push_subscriptions").select("owner_id");
  if (devicesError) return json({ error: devicesError.message }, 500);
  const owners = [...new Set((devices ?? []).map((d: { owner_id: string }) => d.owner_id))];
  const preview: unknown[] = [];
  const planErrors: string[] = [];
  let planned = 0;
  for (const owner of owners) {
    try {
      const reminders = await planFor(db, owner, from, now);
      planned += reminders.length;
      if (dryRun) {
        preview.push(...reminders);
        continue;
      }
      if (reminders.length === 0) continue;
      const { error: saveError } = await db.from("reminders").upsert(
        reminders.map((r) => ({
          owner_id: owner,
          target_type: r.targetType,
          target_id: r.targetId,
          fire_at: r.fireAt.toISOString(),
          kind: "auto",
          title_snapshot: r.title,
          body_snapshot: r.body,
          url: r.url,
          dedupe_key: r.key,
        })),
        { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
      );
      if (saveError) throw new Error(saveError.message);
    } catch (e) {
      planErrors.push((e as Error).message);
    }
  }
  if (dryRun) return json({ dryRun: true, from, to: now, planned: preview, errors: planErrors });

  // Una volta al giorno si toglie il registro più vecchio di un mese.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
    await db.from("reminders").delete().lt("fire_at", new Date(now.getTime() - KEEP_DAYS * DAY_MS).toISOString());
  }

  // 2) Invio di ciò che è in attesa.
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

  return json({ planned, checked: due?.length ?? 0, sent, failed, errors: planErrors });
});

/** Stato di una persona → notifiche con invio tra `from` (escluso) e `to` (compreso). */
async function planFor(db: Db, owner: string, from: Date, to: Date): Promise<Planned[]> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const { data: profile, error: profileError } = await db.from("profiles").select(PROFILE_COLUMNS).eq("owner_id", owner).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) return [];

  const { data: tasks, error: tasksError } = await db
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("owner_id", owner)
    .eq("status", "open")
    .is("deleted_at", null);
  if (tasksError) throw new Error(tasksError.message);

  // Eventi vicini (il margine copre fusi orari, richiami del giorno prima ed eventi su più giorni) e tutte le serie.
  const near = `and(start_at.gte."${new Date(from.getTime() - 3 * DAY_MS).toISOString()}",start_at.lte."${new Date(to.getTime() + 3 * DAY_MS).toISOString()}")`;
  const allDay = `and(all_day.is.true,start_date.gte.${day(from.getTime() - 60 * DAY_MS)},start_date.lte.${day(to.getTime() + 3 * DAY_MS)})`;
  const { data: events, error: eventsError } = await db
    .from("events")
    .select("*")
    .eq("owner_id", owner)
    .is("deleted_at", null)
    .or(`rrule.not.is.null,${near},${allDay}`);
  if (eventsError) throw new Error(eventsError.message);

  const series = (events ?? []).filter((e: { rrule: string | null }) => e.rrule).map((e: { id: string }) => e.id);
  let exceptions: unknown[] = [];
  if (series.length) {
    const { data, error } = await db.from("event_exceptions").select("*").in("event_id", series);
    if (error) throw new Error(error.message);
    exceptions = data ?? [];
  }

  const { display_name, ...settings } = profile as Record<string, unknown>;
  return planReminders({ settings, name: display_name, tasks: tasks ?? [], events: events ?? [], exceptions }, from, to);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
