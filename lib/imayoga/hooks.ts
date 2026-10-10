"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchImayogaAccount, SYNC_INTERVAL_MS, syncImayoga } from "./sync";

export function useImayogaAccount() {
  return useQuery({ queryKey: ["imayoga-account"], queryFn: fetchImayogaAccount, staleTime: 60_000 });
}

/** All'apertura dell'app e al ritorno in primo piano aggiorna le lezioni di imayoga, al massimo ogni 10 minuti. */
export function useImayogaAutoSync() {
  const qc = useQueryClient();
  const { data: account } = useImayogaAccount();
  const connected = !!account;
  const lastSyncedAt = account?.last_synced_at ?? null;

  useEffect(() => {
    if (!connected) return;
    const sync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < SYNC_INTERVAL_MS) return;
      syncImayoga()
        .then((result) => {
          if (result && result.updated + result.removed > 0) qc.invalidateQueries({ queryKey: ["events"] });
        })
        .catch(() => {
          // Senza rete o con imayoga irraggiungibile si riprova più tardi: le lezioni già lette restano visibili.
        })
        .finally(() => {
          qc.invalidateQueries({ queryKey: ["imayoga-account"] });
        });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [connected, lastSyncedAt, qc]);
}
