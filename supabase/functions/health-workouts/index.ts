// Edge Function: riceve gli allenamenti di Salute di Apple da un Comando rapido (technical-design.md, 9.8).
// Autenticazione: il token personale generato in Impostazioni, nell'header Authorization; nel database c'è solo
// la sua impronta. La funzione scrive soltanto nella tabella `workouts` di chi possiede il token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { hashToken, importMessage, looksLikeToken, parseHealthPayload, planHealthImport } from "./health.gen.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BODY_BYTES = 256_000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "metodo non consentito" }, 405);

  const token = (req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-health-token") ?? "").trim();
  if (!looksLikeToken(token)) return json({ error: "non autorizzato" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: link, error: linkError } = await db.from("health_links").select("owner_id").eq("token_hash", await hashToken(token)).maybeSingle();
  if (linkError) return json({ error: "errore interno" }, 500);
  const owner = link?.owner_id as string | undefined;
  if (!owner) return json({ error: "non autorizzato" }, 401);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "richiesta troppo grande" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "richiesta non valida" }, 400);
  }

  const { data: profile } = await db.from("profiles").select("timezone").eq("owner_id", owner).maybeSingle();
  const parsed = parseHealthPayload(body, profile?.timezone ?? undefined);
  if (!parsed) return json({ error: "richiesta non valida" }, 400);

  const fields = "id, activity, date, time, status, health_id, deleted_at";
  const dates = [...new Set(parsed.workouts.map((w) => w.date))];
  const ids = [...new Set(parsed.workouts.map((w) => w.health_id))];
  const [byDate, byId] = await Promise.all([
    db.from("workouts").select(fields).eq("owner_id", owner).in("date", dates),
    db.from("workouts").select(fields).eq("owner_id", owner).in("health_id", ids),
  ]);
  if (byDate.error || byId.error) return json({ error: "errore interno" }, 500);
  const existing = [...new Map([...byDate.data, ...byId.data].map((w) => [w.id, w])).values()];

  const plan = planHealthImport(parsed.workouts, existing);
  for (const { id, patch } of plan.complete) {
    const { error } = await db.from("workouts").update(patch).eq("id", id).eq("owner_id", owner);
    if (error) return json({ error: "errore interno" }, 500);
  }
  if (plan.create.length > 0) {
    // Due invii nello stesso momento non duplicano: `health_id` è unico per utente.
    const { error } = await db
      .from("workouts")
      .upsert(plan.create.map((w) => ({ ...w, owner_id: owner })), { onConflict: "owner_id,health_id", ignoreDuplicates: true });
    if (error) return json({ error: "errore interno" }, 500);
  }
  await db.from("health_links").update({ last_received_at: new Date().toISOString() }).eq("owner_id", owner);

  return json({
    ok: true,
    received: parsed.workouts.length + parsed.rejected,
    completed: plan.complete.length,
    created: plan.create.length,
    known: plan.known,
    rejected: parsed.rejected,
    message: importMessage(plan, parsed.rejected),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
