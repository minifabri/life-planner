import { lockoutSeconds } from "./pin";

/**
 * Stato del blocco del Log, solo in memoria: ricaricando l'app il Log torna bloccato.
 * Lo sblocco vale finché si usa il Log; scade dopo 5 minuti senza attività
 * oppure quando l'app resta in secondo piano per più di un minuto.
 */
export const IDLE_MS = 5 * 60_000;
export const BACKGROUND_MS = 60_000;

let unlocked = false;
let lastActivity = 0;
let hiddenAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function lockLog() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!unlocked) return;
  unlocked = false;
  emit();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (Date.now() - lastActivity >= IDLE_MS) lockLog();
    else schedule();
  }, IDLE_MS - (Date.now() - lastActivity) + 50);
}

export function unlockLog() {
  lastActivity = Date.now();
  schedule();
  if (unlocked) return;
  unlocked = true;
  emit();
}

/** Da chiamare a ogni interazione con il Log: rimanda la scadenza. */
export function touchLock() {
  if (unlocked) lastActivity = Date.now();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else {
      // La finestra di Face ID manda l'app in secondo piano per qualche secondo: non deve ribloccare.
      if (hiddenAt !== null && Date.now() - hiddenAt >= BACKGROUND_MS) lockLog();
      hiddenAt = null;
    }
  });
}

const ATTEMPTS_KEY = "planner-lock-attempts";

type Attempts = { failures: number; lastAt: number };

function readAttempts(): Attempts {
  try {
    const raw = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "null") as Attempts | null;
    return raw && typeof raw.failures === "number" ? raw : { failures: 0, lastAt: 0 };
  } catch {
    return { failures: 0, lastAt: 0 };
  }
}

/** Secondi da aspettare prima di poter riprovare il PIN (0 = si può provare). */
export function pinWaitSeconds(now: number = Date.now()): number {
  const { failures, lastAt } = readAttempts();
  return Math.max(0, Math.ceil((lastAt + lockoutSeconds(failures) * 1000 - now) / 1000));
}

export function recordPinAttempt(ok: boolean) {
  try {
    if (ok) localStorage.removeItem(ATTEMPTS_KEY);
    else localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ failures: readAttempts().failures + 1, lastAt: Date.now() }));
  } catch {
    // Senza localStorage non si contano i tentativi.
  }
}
