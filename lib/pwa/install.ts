"use client";

import { useSyncExternalStore } from "react";

/**
 * Il pulsante "Installa" di Chrome su Android (evento `beforeinstallprompt`). L'evento arriva una volta,
 * subito dopo il caricamento: si tiene da parte finché la persona non tocca "Installa l'app".
 * Safari su iPhone non lo manda: lì restano le istruzioni a mano.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let listening = false;

function notify() {
  for (const l of listeners) l();
}

/** Da chiamare presto, all'avvio dell'app. */
export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Niente barra automatica di Chrome: l'invito sta nelle Impostazioni.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Se Chrome permette di installare l'app con un tocco. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );
}

/** Apre la finestra di installazione di Chrome. Vale una volta sola per evento. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}
