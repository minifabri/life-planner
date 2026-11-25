"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "../supabase/client";
import { NAME_ASKED, sortAccounts, toAdminErrorCode, type AdminErrorCode, type ManagedAccount } from "../accounts/accounts";
import { useAuth } from "@/components/auth/auth-provider";
import { queryClient } from "./query-client";
import type { Profile } from "../supabase/types";

/** Errore di `admin-users`, con il codice da tradurre con `adminErrorMessage`. */
export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
  }
}

type Reply = { ok?: boolean; error?: string; accounts?: ManagedAccount[] };

async function call(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await getSupabase().functions.invoke<Reply>("admin-users", { body });
  if (error || !data) throw new AdminError("network");
  if (!data.ok) throw new AdminError(toAdminErrorCode(data.error));
  return data;
}

/** Se l'account di chi usa l'app amministra (riga in `app_admins`; la RLS mostra solo la propria). */
async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().from("app_admins").select("owner_id").maybeSingle();
  if (error) throw error;
  return !!data;
}

export function useIsAdmin(): boolean {
  const { session } = useAuth();
  const owner = session?.user.id ?? null;
  return useQuery({ queryKey: ["is-admin", owner], queryFn: fetchIsAdmin, enabled: !!owner, staleTime: Infinity }).data ?? false;
}

export function useManagedAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["managed-accounts"],
    queryFn: async () => sortAccounts((await call({ action: "list" })).accounts ?? []),
    enabled,
    staleTime: 30_000,
  });
}

/** Crea l'account con email già confermata e senza password: la persona la sceglie al primo accesso. */
export async function addAccount(email: string): Promise<void> {
  await call({ action: "add", email });
}

export async function setAccountDisabled(id: string, disabled: boolean): Promise<void> {
  await call({ action: disabled ? "deactivate" : "reactivate", id });
}

/** Elimina un altro account e tutti i suoi dati. `confirm` è la sua email, ricontrollata dal server. */
export async function deleteManagedAccount(id: string, confirm: string): Promise<void> {
  await call({ action: "delete", id, confirm });
}

/** Salva il nome scelto al primo accesso (o nessuno, con Salta) e segna che la domanda è stata fatta. */
export async function saveFirstName(profile: Profile, name: string | null): Promise<void> {
  const tours_seen = [...new Set([...(profile.tours_seen ?? []), NAME_ASKED])].sort();
  const display_name = name?.trim() || null;
  queryClient.setQueryData<Profile | null>(["profile"], (old) => (old ? { ...old, display_name, tours_seen } : old));
  const { error } = await getSupabase().from("profiles").update({ display_name, tours_seen }).eq("owner_id", profile.owner_id);
  if (error) throw error;
}
