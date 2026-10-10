import { getDb, type OutboxEntry } from "./db";
import type { Op, SendOutcome } from "./ops";

export type FlushResult = {
  /** Modifiche arrivate al server. */
  sent: number;
  /** Modifiche rifiutate dal server e scartate. */
  rejected: number;
  /** Modifiche ancora in attesa. */
  pending: number;
};

export type Sender = (op: Op) => Promise<SendOutcome>;

const listeners = new Set<() => void>();

/** Avvisa quando la outbox cambia (aggiunta, invio, scarto). */
export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) listener();
}

export async function enqueue(owner: string, ops: Op[], at: string = new Date().toISOString()): Promise<void> {
  if (!ops.length) return;
  await getDb().outbox.bulkAdd(ops.map((op) => ({ owner, at, op })));
  changed();
}

/** Le modifiche in attesa dell'utente, nell'ordine in cui sono state fatte. */
export function pendingEntries(owner: string): Promise<OutboxEntry[]> {
  return getDb().outbox.where("owner").equals(owner).sortBy("seq");
}

export function pendingCount(owner: string): Promise<number> {
  return getDb().outbox.where("owner").equals(owner).count();
}

let running: Promise<FlushResult> | null = null;

async function run(owner: string, send: Sender): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, rejected: 0, pending: 0 };
  // Una alla volta e in ordine: una modifica può dipendere da quella prima (es. ricorrenza → attività).
  for (;;) {
    // A parità di utente l'indice scorre per `seq`: la prima è la più vecchia.
    const entry = await getDb().outbox.where("owner").equals(owner).first();
    if (!entry) break;
    let outcome: SendOutcome;
    try {
      outcome = await send(entry.op);
    } catch {
      outcome = "retry";
    }
    if (outcome === "retry") break;
    await getDb().outbox.delete(entry.seq!);
    if (outcome === "done") result.sent++;
    else result.rejected++;
    changed();
  }
  result.pending = await pendingCount(owner);
  return result;
}

/**
 * Invia le modifiche in attesa. Si ferma alla prima che non parte (si riprova al prossimo giro);
 * se è già in corso un invio, restituisce quello.
 */
export function flush(owner: string, send: Sender): Promise<FlushResult> {
  running ??= run(owner, send).finally(() => {
    running = null;
  });
  return running;
}
