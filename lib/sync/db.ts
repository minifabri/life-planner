import Dexie, { type Table as DexieTable } from "dexie";
import type { Op } from "./ops";

/** Una modifica in attesa di essere inviata. `seq` cresce con l'ordine di creazione. */
export type OutboxEntry = {
  seq?: number;
  /** Utente che ha fatto la modifica: si invia solo con la sua sessione. */
  owner: string;
  /** Momento della modifica (ISO). */
  at: string;
  op: Op;
};

/** Valori qualsiasi per chiave: qui vive la cache delle query (technical-design.md, 6.1). */
export type KeyValue = { key: string; value: unknown };

class PlannerDb extends Dexie {
  outbox!: DexieTable<OutboxEntry, number>;
  kv!: DexieTable<KeyValue, string>;

  constructor() {
    super("planner");
    this.version(1).stores({ outbox: "++seq, owner", kv: "key" });
  }
}

let db: PlannerDb | null = null;

export function getDb(): PlannerDb {
  db ??= new PlannerDb();
  return db;
}
