"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      // Stesso scope del service worker precedente (/sw.js): la registrazione, e con lei l'iscrizione push, resta la stessa.
      .register("/serwist/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("Registrazione del service worker non riuscita", err));
  }, []);
  return null;
}
