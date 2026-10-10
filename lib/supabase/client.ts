import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Client Supabase per il browser.
 * La sessione vive nel localStorage della PWA (vedi technical-design.md, 4.1):
 * le pagine sono shell statiche e i dati arrivano dal client, protetti dalla RLS.
 *
 * Login: codice OTP oppure magic link (flusso implicit, così il link funziona
 * anche se aperto su un dispositivo diverso da quello che l'ha richiesto).
 * Il link riporta a /auth/callback con i token nel frammento dell'URL,
 * che il client legge da solo grazie a detectSessionInUrl.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
      storageKey: "planner-auth",
    },
  });
  return client;
}
