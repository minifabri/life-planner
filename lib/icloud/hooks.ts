"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTimezone } from "../data/hooks";
import { fetchIcloudAccount, fetchIcloudCalendars, SYNC_INTERVAL_MS, syncIcloud } from "./sync";

export function useIcloudAccount() {
  return useQuery({ queryKey: ["icloud-account"], queryFn: fetchIcloudAccount, staleTime: 60_000 });
}

export function useIcloudCalendars(enabled: boolean) {
  return useQuery({ queryKey: ["icloud-calendars"], queryFn: fetchIcloudCalendars, enabled });
}

/** All'apertura dell'app e al ritorno in primo piano aggiorna gli eventi iCloud, al massimo ogni 10 minuti. */
export function useIcloudAutoSync() {
  const tz = useTimezone();
  const qc = useQueryClient();
  const { data: account } = useIcloudAccount();
  const connected = !!account;
  const lastSyncedAt = account?.last_synced_at ?? null;

  useEffect(() => {
    if (!connected) return;
    const sync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < SYNC_INTERVAL_MS) return;
      syncIcloud(tz)
        .then((result) => {
          if (result && result.updated + result.removed > 0) qc.invalidateQueries({ queryKey: ["events"] });
        })
        .catch(() => {
          // Senza rete o con iCloud irraggiungibile si riprova più tardi: gli eventi già letti restano visibili.
        })
        .finally(() => {
          qc.invalidateQueries({ queryKey: ["icloud-account"] });
          qc.invalidateQueries({ queryKey: ["icloud-calendars"] });
        });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [connected, lastSyncedAt, tz, qc]);
}
