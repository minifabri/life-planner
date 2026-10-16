import { getSupabase } from "../supabase/client";
import type { Profile } from "../supabase/types";
import { withSeen, type TourId } from "../tour/tour";
import { queryClient } from "./query-client";

/**
 * Tour visti ma non ancora salvati sul profilo (es. saltati offline). Restano sul dispositivo finché
 * il salvataggio riesce, così il tour non ricompare al prossimo avvio.
 */
const PENDING_KEY = "tours-seen-pending";

export function pendingTours(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function setPending(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(PENDING_KEY, JSON.stringify(ids));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Senza localStorage resta solo il salvataggio sul profilo.
  }
}

/** Segna il tour come visto: subito nella cache, poi sul profilo (vale per tutti i dispositivi). */
export async function markTourSeen(id: TourId): Promise<void> {
  const profile = queryClient.getQueryData<Profile | null>(["profile"]);
  if (!profile) return;
  const next = withSeen([...(profile.tours_seen ?? []), ...pendingTours()], id);
  queryClient.setQueryData<Profile | null>(["profile"], (old) => (old ? { ...old, tours_seen: next } : old));
  setPending(next);
  const { error } = await getSupabase().from("profiles").update({ tours_seen: next }).eq("owner_id", profile.owner_id);
  if (!error) setPending([]);
}

/** Riprova a salvare sul profilo i tour rimasti sul dispositivo. */
export async function flushPendingTours(): Promise<void> {
  const profile = queryClient.getQueryData<Profile | null>(["profile"]);
  const pending = pendingTours();
  if (!profile || pending.length === 0) return;
  if (pending.every((t) => profile.tours_seen?.includes(t))) return setPending([]);
  const next = [...new Set([...(profile.tours_seen ?? []), ...pending])].sort();
  const { error } = await getSupabase().from("profiles").update({ tours_seen: next }).eq("owner_id", profile.owner_id);
  if (error) return;
  queryClient.setQueryData<Profile | null>(["profile"], (old) => (old ? { ...old, tours_seen: next } : old));
  setPending([]);
}
