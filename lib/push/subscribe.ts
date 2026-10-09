import { getSupabase } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "no-sw" | "no-push" | "ios-not-installed" | "denied" };

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function checkPushSupport(): PushSupport {
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-sw" };
  if (!("PushManager" in window)) {
    return { ok: false, reason: isIOS() && !isStandalone() ? "ios-not-installed" : "no-push" };
  }
  if ("Notification" in window && Notification.permission === "denied") return { ok: false, reason: "denied" };
  return { ok: true };
}

/** Va chiamata da un gesto dell'utente (requisito di iOS). */
export async function subscribeToPush(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Chiave VAPID pubblica mancante");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permesso negato");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Subscription incompleta");
  const { error } = await getSupabase()
    .from("push_subscriptions")
    .upsert(
      { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent },
      { onConflict: "endpoint" }
    );
  if (error) throw error;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pianifica una notifica di prova: la invia il cron di Supabase (spike S1). */
export async function scheduleTestNotification(delaySeconds: number): Promise<Date> {
  const fireAt = new Date(Date.now() + delaySeconds * 1000);
  const { error } = await getSupabase().from("reminders").insert({
    target_type: "test",
    kind: "custom",
    fire_at: fireAt.toISOString(),
    title_snapshot: "Notifica di prova",
    body_snapshot: "Se la vedi con l'app chiusa, il test delle notifiche è superato.",
    url: "/settings",
  });
  if (error) throw error;
  return fireAt;
}
