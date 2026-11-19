import { getSupabase } from "../supabase/client";
import type { ChatgptLink } from "../supabase/types";
import { generateToken, hashToken } from "../health/token";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Indirizzo delle Azioni del GPT (technical-design.md, 9.9). */
export function chatgptEndpoint(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chatgpt-actions`;
}

/** Schema da importare nell'editor del GPT ("Importa da URL"). */
export function chatgptSchemaUrl(): string {
  return `${chatgptEndpoint()}/openapi.json`;
}

export async function fetchChatgptLink(): Promise<ChatgptLink | null> {
  return check(await getSupabase().from("chatgpt_links").select("owner_id, created_at, last_used_at").maybeSingle());
}

/** Crea il token e ne salva l'impronta: il token esiste solo nel valore restituito e sostituisce il precedente. */
export async function createChatgptToken(): Promise<string> {
  const token = generateToken();
  check(
    await getSupabase()
      .from("chatgpt_links")
      .upsert({ token_hash: await hashToken(token), last_used_at: null, created_at: new Date().toISOString() }, { onConflict: "owner_id" })
      .select("owner_id"),
  );
  return token;
}

/** Revoca il token: il GPT non può più leggere né scrivere. Ciò che ha già aggiunto resta. */
export async function revokeChatgptLink(): Promise<void> {
  // La RLS limita l'eliminazione alla propria riga; il filtro serve solo perché un delete lo richiede.
  check(await getSupabase().from("chatgpt_links").delete().not("owner_id", "is", null).select("owner_id"));
}
