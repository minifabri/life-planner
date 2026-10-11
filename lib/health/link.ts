import { getSupabase } from "../supabase/client";
import type { HealthLink } from "../supabase/types";
import { generateToken, hashToken } from "./token";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Indirizzo a cui il Comando rapido manda gli allenamenti. */
export function healthEndpoint(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health-workouts`;
}

export async function fetchHealthLink(): Promise<HealthLink | null> {
  return check(await getSupabase().from("health_links").select("owner_id, created_at, last_received_at").maybeSingle());
}

/**
 * Crea il token personale e ne salva l'impronta. Il token esiste solo nel valore restituito:
 * generarne uno nuovo toglie validità al precedente.
 */
export async function createHealthToken(): Promise<string> {
  const token = generateToken();
  check(
    await getSupabase()
      .from("health_links")
      .upsert({ token_hash: await hashToken(token), last_received_at: null, created_at: new Date().toISOString() }, { onConflict: "owner_id" })
      .select("owner_id"),
  );
  return token;
}

/** Revoca il token. Gli allenamenti già arrivati restano. */
export async function revokeHealthLink(): Promise<void> {
  // La RLS limita l'eliminazione alla propria riga; il filtro serve solo perché un delete lo richiede.
  check(await getSupabase().from("health_links").delete().not("owner_id", "is", null).select("owner_id"));
}
