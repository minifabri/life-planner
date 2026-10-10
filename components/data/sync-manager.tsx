"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { materializeRecurrences, prefetchReferenceData } from "@/lib/data/api";
import { usePrefetchAround, useTimezone, useToday } from "@/lib/data/hooks";
import { usePrefetchMeals } from "@/lib/data/meals-hooks";
import { onSynced, sync } from "@/lib/sync/engine";

const SYNC_INTERVAL_MS = 30_000;

/**
 * Tiene allineati dispositivo e server: svuota la outbox all'avvio, al ritorno in primo piano,
 * al ritorno della rete e ogni 30 secondi (technical-design.md, 6.1). Non disegna nulla.
 */
export function SyncManager() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const qc = useQueryClient();
  const toast = useToast();
  usePrefetchAround(today, tz);
  usePrefetchMeals(today);

  useEffect(() => {
    const run = () => void sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    prefetchReferenceData();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", run);
    const timer = setInterval(run, SYNC_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", run);
      clearInterval(timer);
    };
  }, []);

  // Le prossime attività ricorrenti: a ogni apertura, al cambio di giorno e dopo ogni invio riuscito.
  useEffect(() => {
    let active = true;
    const materialize = () => {
      materializeRecurrences(today)
        .then((created) => {
          if (active && created > 0) qc.invalidateQueries({ queryKey: ["tasks"] });
        })
        .catch(() => {
          // Senza rete si riprova alla prossima sincronizzazione: le attività già create restano visibili.
        });
    };
    materialize();
    const off = onSynced((result) => {
      if (result.rejected > 0) {
        toast({
          message: result.rejected === 1 ? "Una modifica non è stata accettata ed è stata annullata." : `${result.rejected} modifiche non sono state accettate e sono state annullate.`,
          tone: "warn",
        });
      }
      if (result.sent > 0) materialize();
    });
    return () => {
      active = false;
      off();
    };
  }, [today, qc, toast]);

  return null;
}
