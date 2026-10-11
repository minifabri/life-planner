import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { queryClient } from "../data/query-client";
import { lockLog } from "../lock/session";
import { getDb } from "./db";

const WRITE_DELAY_MS = 1000;

/** Salva la cache delle query in IndexedDB, al più una volta al secondo. */
export function createPersister(key: string): Persister {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: PersistedClient | null = null;

  async function write() {
    timer = null;
    if (!latest) return;
    try {
      await getDb().kv.put({ key, value: latest });
    } catch {
      // Spazio esaurito o IndexedDB non disponibile: l'app continua senza cache salvata.
    }
  }

  return {
    persistClient(client) {
      latest = client;
      timer ??= setTimeout(write, WRITE_DELAY_MS);
    },
    async restoreClient() {
      try {
        return (await getDb().kv.get(key))?.value as PersistedClient | undefined;
      } catch {
        return undefined;
      }
    },
    async removeClient() {
      latest = null;
      try {
        await getDb().kv.delete(key);
      } catch {
        // Niente da togliere.
      }
    },
  };
}

/** All'uscita dall'account: via i dati in memoria e quelli salvati sul dispositivo. La outbox resta, per non perdere modifiche. */
export async function forgetCachedData(): Promise<void> {
  lockLog();
  queryClient.clear();
  try {
    await getDb().kv.clear();
  } catch {
    // Niente da togliere.
  }
}

/** Dopo l'eliminazione dell'account: via anche le modifiche in attesa, che non hanno più dove andare. */
export async function forgetEverything(): Promise<void> {
  await forgetCachedData();
  try {
    await getDb().outbox.clear();
  } catch {
    // Niente da togliere.
  }
}
