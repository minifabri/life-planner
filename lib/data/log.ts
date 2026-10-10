import { uuidv7 } from "../ids";
import { getSupabase } from "../supabase/client";
import type { LogCategory, LogEntry, LogStub } from "../supabase/types";
import { commit, currentOwner, withPendingLog } from "../sync/engine";
import { byId } from "../sync/ops";
import { queryClient } from "./query-client";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const ENTRY_COLUMNS = "id, category_id, title, notes, date, time, tags, is_sensitive, deleted_at, created_at";
/** Quante registrazioni si tengono in vista: per un uso personale bastano anni. */
const LIMIT = 2000;

/** Le registrazioni non riservate: si leggono sempre e restano in cache sul dispositivo. */
export async function fetchOpenEntries(): Promise<LogEntry[]> {
  return withPendingLog(
    check(
      await getSupabase()
        .from("log_entries")
        .select(ENTRY_COLUMNS)
        .eq("is_sensitive", false)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .limit(LIMIT),
    ),
  );
}

/** Delle registrazioni riservate, a Log bloccato, si chiede solo il giorno: né titolo né categoria lasciano il server. */
export async function fetchPrivateStubs(): Promise<LogStub[]> {
  return check(
    await getSupabase().from("log_entries").select("id, date").eq("is_sensitive", true).is("deleted_at", null).order("date", { ascending: false }).limit(LIMIT),
  );
}

/** Le registrazioni riservate complete: solo a Log sbloccato, solo in memoria. */
export async function fetchPrivateEntries(): Promise<LogEntry[]> {
  return check(
    await getSupabase()
      .from("log_entries")
      .select(ENTRY_COLUMNS)
      .eq("is_sensitive", true)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(LIMIT),
  );
}

export const OPEN_KEY = ["log-entries"];
export const STUBS_KEY = ["log-private", "stubs"];
export const PRIVATE_KEY = ["log-private", "full"];

/** Al blocco del Log il contenuto riservato esce dalla memoria. */
export function forgetPrivateEntries() {
  queryClient.removeQueries({ queryKey: PRIVATE_KEY });
}

function refreshPrivate() {
  void queryClient.invalidateQueries({ queryKey: ["log-private"] });
}

export type LogEntryInput = Pick<LogEntry, "category_id" | "title" | "notes" | "date" | "time" | "tags" | "is_sensitive">;

/**
 * Le registrazioni riservate si scrivono solo con la rete, direttamente: non passano dalla outbox,
 * che è salvata in chiaro sul dispositivo. Le altre seguono la strada di tutte le modifiche.
 */
export async function createEntry(input: LogEntryInput): Promise<string> {
  const id = uuidv7();
  if (input.is_sensitive) {
    check(await getSupabase().from("log_entries").insert({ id, ...input }).select("id"));
    refreshPrivate();
  } else {
    await commit([{ kind: "insert", table: "log_entries", row: { id, ...input } }]);
  }
  return id;
}

export async function updateEntry(entry: LogEntry, input: LogEntryInput): Promise<void> {
  if (entry.is_sensitive || input.is_sensitive) {
    check(await getSupabase().from("log_entries").update(input).eq("id", entry.id).select("id"));
    refreshPrivate();
    void queryClient.invalidateQueries({ queryKey: OPEN_KEY });
  } else {
    await commit([{ kind: "update", table: "log_entries", patch: input, where: byId(entry.id), snapshot: { ...entry, ...input } }]);
  }
}

/** Eliminazione reversibile: nella outbox finisce solo l'id, mai il contenuto. */
export async function setEntryDeleted(entry: LogEntry, deleted: boolean): Promise<void> {
  const patch = { deleted_at: deleted ? new Date().toISOString() : null };
  if (entry.is_sensitive) {
    check(await getSupabase().from("log_entries").update(patch).eq("id", entry.id).select("id"));
    refreshPrivate();
  } else {
    await commit([{ kind: "update", table: "log_entries", patch, where: byId(entry.id), snapshot: { ...entry, ...patch } }]);
  }
}

export type CategoryInput = Pick<LogCategory, "name" | "color" | "is_sensitive" | "track_last" | "keywords">;

function refreshCategories() {
  return queryClient.invalidateQueries({ queryKey: ["log-categories"] });
}

export async function createCategory(input: CategoryInput, sortOrder: number): Promise<void> {
  check(await getSupabase().from("log_categories").insert({ id: uuidv7(), ...input, sort_order: sortOrder }).select("id"));
  await refreshCategories();
}

export async function updateCategory(id: string, input: CategoryInput): Promise<void> {
  check(await getSupabase().from("log_categories").update(input).eq("id", id).select("id"));
  await refreshCategories();
}

/** Le registrazioni della categoria restano, senza categoria. */
export async function deleteCategory(id: string): Promise<void> {
  check(await getSupabase().from("log_categories").delete().eq("id", id).select("id"));
  await refreshCategories();
  void queryClient.invalidateQueries({ queryKey: OPEN_KEY });
  refreshPrivate();
}

/** Hash del PIN salvato nel profilo (null = nessun PIN impostato). */
export async function fetchPinHash(): Promise<string | null> {
  const row: { log_lock_pin_hash: string | null } | null = check(
    await getSupabase().from("profiles").select("log_lock_pin_hash").maybeSingle(),
  );
  return row?.log_lock_pin_hash ?? null;
}

export async function savePinHash(hash: string | null): Promise<void> {
  const owner = await currentOwner();
  if (!owner) throw new Error("Sessione mancante");
  check(await getSupabase().from("profiles").update({ log_lock_pin_hash: hash }).eq("owner_id", owner).select("owner_id"));
  await queryClient.invalidateQueries({ queryKey: ["log-lock"] });
}
