/// <reference lib="webworker" />
import { ExpirationPlugin, NetworkFirst, Serwist, type PrecacheEntry, type RuntimeCaching, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker (technical-design.md, 6.3).
 * - Precache della shell: le schermate e gli asset statici, così l'app si apre senza rete.
 * - Pagine e dati di navigazione: prima la rete, poi l'ultima copia.
 * - Le richieste verso Supabase non passano da qui: i dati vivono in IndexedDB, mai nella cache HTTP.
 * - Notifiche push e apertura dall'avviso.
 */
const sameOriginPage = ({ request, sameOrigin, url }: { request: Request; sameOrigin: boolean; url: URL }) =>
  sameOrigin && !url.pathname.startsWith("/api/") && (request.mode === "navigate" || request.headers.get("RSC") === "1");

const runtimeCaching: RuntimeCaching[] =
  process.env.NODE_ENV === "production"
    ? [
        {
          matcher: sameOriginPage,
          handler: new NetworkFirst({
            cacheName: "pages",
            networkTimeoutSeconds: 4,
            plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
          }),
        },
      ]
    : [];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching,
});

serwist.addEventListeners();

type PushData = { title?: string; body?: string; tag?: string; url?: string };

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Planner", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Planner", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
