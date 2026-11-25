// Edge Function: gestione degli account da parte di chi amministra (D76, technical-design.md 4.1 e incremento 40).
// Autenticazione: il token dell'utente, che deve avere una riga in `app_admins`. Poi tutto passa dalla service role.
// Azioni: list, add, deactivate, reactivate, delete. Le password non passano mai di qui: ognuno sceglie la sua.
// Chi amministra non può disattivare né eliminare sé stesso o un altro amministratore.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deleteAccountCompletely } from "../_shared/account-cleanup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Disattivato = accesso bloccato per circa cento anni; si riattiva con "none".
const BAN_FOREVER = "876000h";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AuthUser = { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; banned_until?: string | null };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo non consentito" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = await db.auth.getUser(token);
  const me = auth?.user;
  if (!me) return json({ error: "non autorizzato" }, 401);

  const { data: admins, error: adminsError } = await db.from("app_admins").select("owner_id");
  if (adminsError) return json({ error: "errore" }, 500);
  const adminIds = new Set((admins ?? []).map((a: { owner_id: string }) => a.owner_id));
  if (!adminIds.has(me.id)) return json({ error: "non autorizzato" }, 403);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "richiesta non valida" }, 400);
  }
  const action = String(input.action ?? "");

  if (action === "list") {
    const users: AuthUser[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: "errore" }, 500);
      users.push(...(data.users as AuthUser[]));
      if (data.users.length < 1000) break;
    }
    const now = Date.now();
    return json({
      ok: true,
      accounts: users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        disabled: !!u.banned_until && new Date(u.banned_until).getTime() > now,
        admin: adminIds.has(u.id),
        self: u.id === me.id,
      })),
    });
  }

  if (action === "add") {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return json({ error: "invalid_email" });
    // Email già confermata e nessuna password: la persona entra la prima volta con il codice e la sceglie lei.
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already") || m.includes("exists") || m.includes("registered")) return json({ error: "already_exists" });
      return json({ error: "errore" }, 500);
    }
    return json({ ok: true, id: data.user?.id });
  }

  const id = String(input.id ?? "");
  if (!UUID.test(id)) return json({ error: "richiesta non valida" }, 400);
  if (id === me.id || adminIds.has(id)) return json({ error: "not_allowed" });

  if (action === "deactivate" || action === "reactivate") {
    const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === "deactivate" ? BAN_FOREVER : "none" });
    if (error) return json({ error: "errore" }, 500);
    // Un account disattivato non riceve notifiche: senza subscription la Edge Function dei promemoria lo salta.
    // Riattivato, il dispositivo si iscrive di nuovo dalle Impostazioni.
    if (action === "deactivate") await db.from("push_subscriptions").delete().eq("owner_id", id);
    return json({ ok: true });
  }

  if (action === "delete") {
    const { data: target, error: targetError } = await db.auth.admin.getUserById(id);
    if (targetError || !target?.user) return json({ error: "not_found" });
    const confirm = String(input.confirm ?? "").trim().toLowerCase();
    if (!target.user.email || confirm !== target.user.email.toLowerCase()) return json({ error: "conferma mancante" }, 400);
    const result = await deleteAccountCompletely(db, id);
    if (!result.ok) return json({ error: "errore", step: result.step }, 500);
    return json({ ok: true });
  }

  return json({ error: "richiesta non valida" }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
