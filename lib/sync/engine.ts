import { queryClient } from "../data/query-client";
import type { LocalDate } from "../dates/local";
import { DEFAULT_TZ } from "../dates/today";
import { getSupabase } from "../supabase/client";
import type { Profile, Recurrence, Task } from "../supabase/types";
import { enqueue, flush, onOutboxChange, pendingCount, pendingEntries, type FlushResult } from "./outbox";
import { applyToDayEvents, applyToRecurrences, applyToTasks, classifyStatus, type DayEvents, type Op, type SendOutcome } from "./ops";

/** L'utente della sessione salvata sul dispositivo: si legge anche senza rete. */
async function currentOwner(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

function timezone(): string {
  return queryClient.getQueryData<Profile | null>(["profile"])?.timezone ?? DEFAULT_TZ;
}

async function send(op: Op): Promise<SendOutcome> {
  const table = getSupabase().from(op.table);
  let result: { status: number; error: unknown };
  if (op.kind === "insert") {
    result = await table.upsert(op.row, { onConflict: op.onConflict ?? "id", ignoreDuplicates: !op.merge });
  } else {
    let query = op.kind === "update" ? table.update(op.patch) : table.delete();
    for (const [column, operator, value] of op.where) query = operator === "eq" ? query.eq(column, value) : query.gt(column, value);
    result = await query;
  }
  return classifyStatus(result.status, !!result.error);
}

/** Porta una modifica nei dati già in cache, così l'interfaccia la mostra subito. */
function applyToCache(op: Op, at: string) {
  if (op.table === "tasks") {
    queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) => old && applyToTasks(old, op, at));
  } else if (op.table === "events" || op.table === "event_exceptions") {
    const tz = timezone();
    for (const [key, data] of queryClient.getQueriesData<DayEvents>({ queryKey: ["events"] })) {
      if (data) queryClient.setQueryData(key, applyToDayEvents(data, op, at, key[1] as LocalDate, tz));
    }
  } else if (op.table === "recurrences") {
    queryClient.setQueryData<Recurrence[]>(["recurrences"], (old) => old && applyToRecurrences(old, op));
  }
}

/**
 * Salva una o più modifiche: entrano nella outbox del dispositivo, compaiono subito nell'interfaccia
 * e partono verso il server appena c'è rete. La promessa si chiude quando sono al sicuro nella outbox.
 */
export async function commit(ops: Op[]): Promise<void> {
  const owner = await currentOwner();
  if (!owner) throw new Error("Sessione mancante");
  const at = new Date().toISOString();
  await enqueue(owner, ops, at);
  for (const op of ops) applyToCache(op, at);
  void sync();
}

async function pending(): Promise<{ op: Op; at: string }[]> {
  try {
    const owner = await currentOwner();
    return owner ? await pendingEntries(owner) : [];
  } catch {
    return [];
  }
}

/** I dati appena letti dal server con sopra le modifiche non ancora inviate. */
export async function withPendingTasks(tasks: Task[]): Promise<Task[]> {
  return (await pending()).reduce((acc, e) => applyToTasks(acc, e.op, e.at), tasks);
}

export async function withPendingEvents(data: DayEvents, day: LocalDate, tz: string): Promise<DayEvents> {
  return (await pending()).reduce((acc, e) => applyToDayEvents(acc, e.op, e.at, day, tz), data);
}

export async function withPendingRecurrences(recurrences: Recurrence[]): Promise<Recurrence[]> {
  return (await pending()).reduce((acc, e) => applyToRecurrences(acc, e.op), recurrences);
}

export type SyncState = {
  /** Modifiche non ancora arrivate al server. */
  pending: number;
  /** L'ultimo invio si è fermato: manca la rete o il server non risponde. */
  stalled: boolean;
};

let state: SyncState = { pending: 0, stalled: false };
const stateListeners = new Set<() => void>();
const syncedListeners = new Set<(result: FlushResult) => void>();

function setState(next: SyncState) {
  if (next.pending === state.pending && next.stalled === state.stalled) return;
  state = next;
  for (const listener of stateListeners) listener();
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Chiamato dopo ogni invio che ha fatto arrivare (o scartare) qualcosa. */
export function onSynced(listener: (result: FlushResult) => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

async function refreshPending() {
  try {
    const owner = await currentOwner();
    const count = owner ? await pendingCount(owner) : 0;
    setState({ pending: count, stalled: count > 0 && state.stalled });
  } catch {
    // IndexedDB non disponibile: lo stato resta com'è.
  }
}

if (typeof window !== "undefined") onOutboxChange(() => void refreshPending());

let running: Promise<void> | null = null;
let again = false;

async function runSync() {
  do {
    again = false;
    const owner = await currentOwner();
    if (!owner || (await pendingCount(owner)) === 0) {
      setState({ pending: 0, stalled: false });
      return;
    }
    const result = await flush(owner, send);
    setState({ pending: result.pending, stalled: result.pending > 0 });
    if (result.sent || result.rejected) {
      // Si rilegge dal server: è lui la fonte di verità, anche per ciò che ha rifiutato.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["recurrences"] });
      for (const listener of syncedListeners) listener(result);
    }
    if (result.pending > 0 && !again) return;
  } while (again);
}

/** Prova a svuotare la outbox. Chiamarla più volte insieme non crea invii doppi. */
export function sync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runSync()
    .catch(() => {
      // IndexedDB o sessione non disponibili: si riprova al prossimo giro.
    })
    .finally(() => {
      running = null;
    });
  return running;
}
