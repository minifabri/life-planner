"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTimezone } from "../data/hooks";
import { fetchGcalCalendars, SYNC_INTERVAL_MS, syncGcal } from "./sync";

export function useGcalCalendars() {
  return useQuery({ queryKey: ["gcal-calendars"], queryFn: fetchGcalCalendars, staleTime: 60_000 });
}

/** All'apertura dell'app e al ritorno in primo piano aggiorna gli eventi di Google, al massimo ogni 10 minuti. */
export function useGcalAutoSync() {
  const tz = useTimezone();
  const qc = useQueryClient();
  const { data: calendars } = useGcalCalendars();
  const connected = !!calendars?.length;
  // La sync più vecchia decide: basta un calendario indietro per rileggere.
  const lastSyncedAt = calendars?.length
    ? calendars.some((c) => !c.last_synced_at)
      ? null
      : calendars.map((c) => c.last_synced_at!).sort()[0]
    : null;

  useEffect(() => {
    if (!connected) return;
    const sync = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < SYNC_INTERVAL_MS) return;
      syncGcal(tz)
        .then((result) => {
          if (result && result.updated + result.removed > 0) qc.invalidateQueries({ queryKey: ["events"] });
        })
        .catch(() => {
          // Senza rete o con Google irraggiungibile si riprova più tardi: gli eventi già letti restano visibili.
        })
        .finally(() => qc.invalidateQueries({ queryKey: ["gcal-calendars"] }));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [connected, lastSyncedAt, tz, qc]);
}
