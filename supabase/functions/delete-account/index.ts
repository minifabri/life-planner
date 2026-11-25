// Edge Function: elimina l'account di chi chiama e tutti i suoi dati (technical-design.md, 10).
// Autenticazione: il token dell'utente. Per conferma il corpo deve contenere l'email dell'account.
// La pulizia (segreti in Vault, foto in Storage, utente) è in `_shared/account-cleanup.ts`, la stessa
// usata da `admin-users`. Non si può annullare.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deleteAccountCompletely } from "../_shared/account-cleanup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const user = auth?.user;
  if (!user) return json({ error: "non autorizzato" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "richiesta non valida" }, 400);
  }
  const confirm = typeof input.confirm === "string" ? input.confirm.trim().toLowerCase() : "";
  if (!user.email || confirm !== user.email.toLowerCase()) return json({ error: "conferma mancante" }, 400);

  const result = await deleteAccountCompletely(db, user.id);
  if (!result.ok) return json({ error: result.step === "user" ? "account non eliminato" : "dati non eliminati" }, 500);

  return json({ deleted: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
