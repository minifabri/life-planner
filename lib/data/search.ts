import { getSupabase } from "../supabase/client";
import type { Task } from "../supabase/types";
import type { SearchQuery, SearchResult } from "../search/query";

/**
 * Ricerca globale sul server (funzione `search_all`). Serve la connessione.
 * I risultati non passano dalla cache salvata sul dispositivo: a Log sbloccato possono contenere registrazioni riservate.
 */
export async function searchAll(query: SearchQuery, includeSensitive: boolean): Promise<SearchResult[]> {
  const { data, error } = await getSupabase().rpc("search_all", {
    q: query.text,
    from_date: query.from,
    to_date: query.to,
    include_sensitive: includeSensitive,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchResult[];
}

/** L'attività trovata, completa, per aprirla nel modulo di modifica. */
export async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await getSupabase().from("tasks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Task | null;
}
