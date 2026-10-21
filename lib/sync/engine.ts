import { queryClient } from "../data/query-client";
import type { LocalDate } from "../dates/local";
import { DEFAULT_TZ } from "../dates/today";
import { getSupabase } from "../supabase/client";
import { addDays } from "../dates/local";
import type { DayMark, LaundryLoad, LogEntry, Medicine, MedicineDose, MealMemory, MealPlan, Outfit, OutfitFeedback, OutfitPlan, Profile, QuestionAnswer, Recurrence, ShoppingItem, Task, WardrobeItem, WardrobeWear, WishlistItem, Workout } from "../supabase/types";
import { enqueue, flush, onOutboxChange, pendingCount, pendingEntries, type FlushResult } from "./outbox";
import { applyToDayEvents, applyToDayMarks, applyToFeedback, applyToDoses, applyToLoads, applyToLog, applyToMedicines, applyToMealMemory, applyToMeals, applyToOutfits, applyToPantry, applyToPlans, applyToRecurrences, applyToShopping, applyToAnswers, applyToTasks, applyToWardrobe, applyToWears, applyToWishlist, applyToWorkouts, classifyStatus, type DayEvents, type Op, type SendOutcome } from "./ops";

/** L'utente della sessione salvata sul dispositivo: si legge anche senza rete. */
export async function currentOwner(): Promise<string | null> {
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
      // Chiave di un giorno: ["events", giorno]; di un intervallo (settimana, mese): ["events", dal, al].
      const from = key[1] as LocalDate;
      if (data) queryClient.setQueryData(key, applyToDayEvents(data, op, at, from, tz, (key[2] as LocalDate | undefined) ?? from));
    }
  } else if (op.table === "recurrences") {
    queryClient.setQueryData<Recurrence[]>(["recurrences"], (old) => old && applyToRecurrences(old, op));
  } else if (op.table === "shopping_items") {
    queryClient.setQueryData<ShoppingItem[]>(["shopping-items"], (old) => old && applyToShopping(old, op, at));
    queryClient.setQueryData<ShoppingItem[]>(["pantry-items"], (old) => old && applyToPantry(old, op, at));
  } else if (op.table === "meal_plans") {
    for (const [key, data] of queryClient.getQueriesData<MealPlan[]>({ queryKey: ["meals"] })) {
      const from = key[1] as LocalDate;
      if (data) queryClient.setQueryData(key, applyToMeals(data, op, from, addDays(from, 6)));
    }
  } else if (op.table === "log_entries") {
    queryClient.setQueryData<LogEntry[]>(["log-entries"], (old) => old && applyToLog(old, op, at));
  } else if (op.table === "wishlist_items") {
    queryClient.setQueryData<WishlistItem[]>(["wishlist-items"], (old) => old && applyToWishlist(old, op, at));
  } else if (op.table === "wardrobe_items") {
    queryClient.setQueryData<WardrobeItem[]>(["wardrobe-items"], (old) => old && applyToWardrobe(old, op, at));
  } else if (op.table === "outfits") {
    queryClient.setQueryData<Outfit[]>(["outfits"], (old) => old && applyToOutfits(old, op, at));
  } else if (op.table === "wardrobe_wears") {
    queryClient.setQueryData<WardrobeWear[]>(["wardrobe-wears"], (old) => old && applyToWears(old, op, at));
  } else if (op.table === "outfit_plans") {
    queryClient.setQueryData<OutfitPlan[]>(["outfit-plans"], (old) => old && applyToPlans(old, op, at));
  } else if (op.table === "question_answers") {
    queryClient.setQueryData<QuestionAnswer[]>(["question-answers"], (old) => old && applyToAnswers(old, op, at));
  } else if (op.table === "laundry_loads") {
    queryClient.setQueryData<LaundryLoad[]>(["laundry-loads"], (old) => old && applyToLoads(old, op, at));
  } else if (op.table === "medicines") {
    queryClient.setQueryData<Medicine[]>(["medicines"], (old) => old && applyToMedicines(old, op, at));
  } else if (op.table === "medicine_doses") {
    queryClient.setQueriesData<MedicineDose[]>({ queryKey: ["medicine-doses"] }, (old) => old && applyToDoses(old, op, at));
  } else if (op.table === "outfit_feedback") {
    queryClient.setQueryData<OutfitFeedback[]>(["outfit-feedback"], (old) => old && applyToFeedback(old, op, at));
  } else if (op.table === "meal_memory") {
    queryClient.setQueryData<MealMemory[]>(["meal-memory"], (old) => old && applyToMealMemory(old, op));
  } else if (op.table === "workouts") {
    // Chiave: ["workouts", dal, al].
    for (const [key, data] of queryClient.getQueriesData<Workout[]>({ queryKey: ["workouts"] })) {
      if (data) queryClient.setQueryData(key, applyToWorkouts(data, op, at, key[1] as LocalDate, key[2] as LocalDate));
    }
  } else if (op.table === "day_marks") {
    // Chiave: ["day-marks", dal, al].
    for (const [key, data] of queryClient.getQueriesData<DayMark[]>({ queryKey: ["day-marks"] })) {
      if (data) queryClient.setQueryData(key, applyToDayMarks(data, op, key[1] as LocalDate, key[2] as LocalDate));
    }
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

/** Chiave delle query di attività ed eventi riservati: mai salvate sul dispositivo (lib/data/private.ts). */
export const PRIVATE_ITEMS_KEY = "private-items";

/**
 * Salva subito sul server, senza passare dalla outbox né dalla cache salvata: è la strada di attività
 * ed eventi riservati, il cui contenuto non deve restare in chiaro sul dispositivo. Serve la connessione:
 * senza, la promessa fallisce e non resta nulla da inviare.
 */
export async function commitDirect(ops: Op[]): Promise<void> {
  if (!(await currentOwner())) throw new Error("Sessione mancante");
  for (const op of ops) {
    if ((await send(op)) !== "done") throw new Error("Modifica non salvata");
  }
  for (const key of [PRIVATE_ITEMS_KEY, "tasks", "events"]) void queryClient.invalidateQueries({ queryKey: [key] });
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

export async function withPendingEvents(data: DayEvents, day: LocalDate, tz: string, to: LocalDate = day): Promise<DayEvents> {
  return (await pending()).reduce((acc, e) => applyToDayEvents(acc, e.op, e.at, day, tz, to), data);
}

export async function withPendingRecurrences(recurrences: Recurrence[]): Promise<Recurrence[]> {
  return (await pending()).reduce((acc, e) => applyToRecurrences(acc, e.op), recurrences);
}

export async function withPendingShopping(items: ShoppingItem[]): Promise<ShoppingItem[]> {
  return (await pending()).reduce((acc, e) => applyToShopping(acc, e.op, e.at), items);
}

export async function withPendingPantry(items: ShoppingItem[]): Promise<ShoppingItem[]> {
  return (await pending()).reduce((acc, e) => applyToPantry(acc, e.op, e.at), items);
}

export async function withPendingMeals(meals: MealPlan[], from: LocalDate): Promise<MealPlan[]> {
  return (await pending()).reduce((acc, e) => applyToMeals(acc, e.op, from, addDays(from, 6)), meals);
}

export async function withPendingMealMemory(memory: MealMemory[]): Promise<MealMemory[]> {
  return (await pending()).reduce((acc, e) => applyToMealMemory(acc, e.op), memory);
}

export async function withPendingLog(entries: LogEntry[]): Promise<LogEntry[]> {
  return (await pending()).reduce((acc, e) => applyToLog(acc, e.op, e.at), entries);
}

export async function withPendingWishlist(items: WishlistItem[]): Promise<WishlistItem[]> {
  return (await pending()).reduce((acc, e) => applyToWishlist(acc, e.op, e.at), items);
}

export async function withPendingWardrobe(items: WardrobeItem[]): Promise<WardrobeItem[]> {
  return (await pending()).reduce((acc, e) => applyToWardrobe(acc, e.op, e.at), items);
}

export async function withPendingOutfits(outfits: Outfit[]): Promise<Outfit[]> {
  return (await pending()).reduce((acc, e) => applyToOutfits(acc, e.op, e.at), outfits);
}

export async function withPendingWears(wears: WardrobeWear[]): Promise<WardrobeWear[]> {
  return (await pending()).reduce((acc, e) => applyToWears(acc, e.op, e.at), wears);
}

export async function withPendingAnswers(answers: QuestionAnswer[]): Promise<QuestionAnswer[]> {
  return (await pending()).reduce((acc, e) => applyToAnswers(acc, e.op, e.at), answers);
}

export async function withPendingMedicines(medicines: Medicine[]): Promise<Medicine[]> {
  return (await pending()).reduce((acc, e) => applyToMedicines(acc, e.op, e.at), medicines);
}

export async function withPendingDoses(doses: MedicineDose[]): Promise<MedicineDose[]> {
  return (await pending()).reduce((acc, e) => applyToDoses(acc, e.op, e.at), doses);
}

export async function withPendingLoads(loads: LaundryLoad[]): Promise<LaundryLoad[]> {
  return (await pending()).reduce((acc, e) => applyToLoads(acc, e.op, e.at), loads);
}

export async function withPendingPlans(plans: OutfitPlan[]): Promise<OutfitPlan[]> {
  return (await pending()).reduce((acc, e) => applyToPlans(acc, e.op, e.at), plans);
}

export async function withPendingFeedback(feedback: OutfitFeedback[]): Promise<OutfitFeedback[]> {
  return (await pending()).reduce((acc, e) => applyToFeedback(acc, e.op, e.at), feedback);
}

export async function withPendingWorkouts(workouts: Workout[], from: LocalDate, to: LocalDate): Promise<Workout[]> {
  return (await pending()).reduce((acc, e) => applyToWorkouts(acc, e.op, e.at, from, to), workouts);
}

export async function withPendingDayMarks(marks: DayMark[], from: LocalDate, to: LocalDate): Promise<DayMark[]> {
  return (await pending()).reduce((acc, e) => applyToDayMarks(acc, e.op, from, to), marks);
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
      // Si rilegge tutto dal server: è lui la fonte di verità, anche per ciò che ha rifiutato
      // e per ciò che calcola da solo (es. il catalogo della spesa).
      void queryClient.invalidateQueries();
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
