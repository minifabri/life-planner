"use client";

import { useEffect } from "react";

/** Si sta scrivendo qualcosa: ricaricare adesso farebbe perdere il testo. */
function editing(): boolean {
  const el = document.activeElement;
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | null = null;
    sw
      // Stesso scope del service worker precedente (/sw.js): la registrazione, e con lei l'iscrizione push, resta la stessa.
      .register("/serwist/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => (registration = r))
      .catch((err) => console.error("Registrazione del service worker non riuscita", err));

    // La PWA installata resta aperta per giorni e non ricarica mai la pagina: quando torna in primo piano
    // si controlla se c'è una versione nuova, e quando il nuovo service worker prende il controllo si ricarica.
    const hadController = !!sw.controller;
    let reloading = false;
    function reload() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    function onControllerChange() {
      // Alla prima installazione non c'è nulla di vecchio da sostituire.
      if (!hadController) return;
      if (document.hidden || !editing()) reload();
      else document.addEventListener("visibilitychange", () => document.hidden && reload());
    }
    function onVisible() {
      if (!document.hidden) registration?.update().catch(() => {});
    }
    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
