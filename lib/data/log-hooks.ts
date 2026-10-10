"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { isUnlocked, subscribeLock, touchLock } from "../lock/session";
import { OPEN_KEY, PRIVATE_KEY, STUBS_KEY, fetchOpenEntries, fetchPinHash, fetchPrivateEntries, fetchPrivateStubs, forgetPrivateEntries } from "./log";

/** Vero finché il Log è sbloccato. */
export function useLogUnlocked(): boolean {
  return useSyncExternalStore(subscribeLock, isUnlocked, () => false);
}

export function useOpenEntries() {
  return useQuery({ queryKey: OPEN_KEY, queryFn: fetchOpenEntries });
}

/** Giorni delle registrazioni riservate: niente contenuto, mai salvati sul dispositivo. */
export function usePrivateStubs() {
  return useQuery({ queryKey: STUBS_KEY, queryFn: fetchPrivateStubs, gcTime: 5 * 60_000 });
}

/** Contenuto riservato: richiesto solo a Log sbloccato e tolto dalla memoria appena si blocca. */
export function usePrivateEntries() {
  const unlocked = useLogUnlocked();
  useEffect(() => {
    if (!unlocked) forgetPrivateEntries();
  }, [unlocked]);
  return useQuery({ queryKey: PRIVATE_KEY, queryFn: fetchPrivateEntries, enabled: unlocked, gcTime: 0, staleTime: 30_000 });
}

export function usePinHash() {
  return useQuery({ queryKey: ["log-lock"], queryFn: fetchPinHash, staleTime: 5 * 60_000, gcTime: 5 * 60_000 });
}

/** Ogni interazione nella pagina rimanda la scadenza dello sblocco. */
export function useKeepUnlockedWhileActive() {
  useEffect(() => {
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const e of events) window.addEventListener(e, touchLock, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, touchLock);
    };
  }, []);
}
