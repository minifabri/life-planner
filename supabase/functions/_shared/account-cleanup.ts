// Eliminazione completa di un account (technical-design.md, 10), usata da `delete-account` (chi elimina
// sé stesso) e da `admin-users` (chi amministra, D76). Ordine: segreti in Vault, file in Storage, utente;
// le righe delle tabelle, le subscription push e i token spariscono a cascata. Non si può annullare.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Db = SupabaseClient;

/** Bucket con una cartella per utente (`<owner_id>/...`). */
const BUCKETS = ["wardrobe"];
const PAGE = 1000;

export async function deleteAccountCompletely(db: Db, owner: string): Promise<{ ok: true } | { ok: false; step: string }> {
  const { error: secretsError } = await db.rpc("delete_account_secrets", { p_owner: owner });
  if (secretsError) return { ok: false, step: "secrets" };

  for (const bucket of BUCKETS) {
    if (!(await emptyFolder(db, bucket, owner))) return { ok: false, step: "storage" };
  }

  const { error: deleteError } = await db.auth.admin.deleteUser(owner);
  if (deleteError) return { ok: false, step: "user" };
  return { ok: true };
}

async function emptyFolder(db: Db, bucket: string, folder: string): Promise<boolean> {
  // Si rilegge sempre la prima pagina: ciò che è stato tolto non c'è più.
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: PAGE });
    if (error) return false;
    const files = (data ?? []).filter((f) => f.id !== null);
    if (files.length === 0) return true;
    const { error: removeError } = await db.storage.from(bucket).remove(files.map((f) => `${folder}/${f.name}`));
    if (removeError) return false;
  }
  return false;
}
