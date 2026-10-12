import { addDays, type LocalDate } from "../dates/local";
import type { MealMemory, MealPlan, MealSlot, Nutrient, PrepMode, Task } from "../supabase/types";
import { byId, type Op } from "../sync/ops";

/**
 * Regole del planner pasti (technical-design.md, 5.1): cosa cambia, e in quale ordine, a ogni azione
 * sul pasto o sulla sua attività di preparazione. Le funzioni restituiscono operazioni per la outbox:
 * valgono allo stesso modo con e senza rete. Il database applica le stesse regole con dei trigger.
 */

/** I pasti della giornata. Gli extra ("extra") non sono un pasto: stanno a parte, facoltativi. */
export const SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  snack: "Merenda",
  dinner: "Cena",
  extra: "Extra",
};

const SLOT_WITH_ARTICLE: Record<MealSlot, string> = {
  breakfast: "la colazione",
  lunch: "il pranzo",
  snack: "la merenda",
  dinner: "la cena",
  extra: "gli extra",
};

export function reminderTitle(slot: MealSlot): string {
  return `Preparare ${SLOT_WITH_ARTICLE[slot]} di domani`;
}

/** Nome senza maiuscole, accenti e spazi doppi: "Pasta  al Ragù" e "pasta al ragu" sono lo stesso pasto. */
export function normalizeMealName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Il giorno in cui preparare: quello prima del pasto. Nessuno se è già passato
 * (pasti di oggi o di giorni passati non generano attività).
 */
export function reminderDate(mealDate: LocalDate, today: LocalDate): LocalDate | null {
  const day = addDays(mealDate, -1);
  return day >= today ? day : null;
}

type MealKey = Pick<MealPlan, "id" | "date" | "slot" | "name">;

/** Crea l'attività del giorno prima e la collega al pasto (se il giorno prima non è già passato). */
function reminderOps(meal: MealKey, taskId: string, today: LocalDate): Op[] {
  const date = reminderDate(meal.date, today);
  if (!date) return [];
  return [
    {
      kind: "insert",
      table: "tasks",
      row: { id: taskId, title: reminderTitle(meal.slot), notes: meal.name, date, source: "meal", meal_plan_id: meal.id },
    },
    { kind: "update", table: "meal_plans", patch: { reminder_task_id: taskId }, where: byId(meal.id) },
  ];
}

function removeReminderOps(meal: Pick<MealPlan, "reminder_task_id">, now: string): Op[] {
  if (!meal.reminder_task_id) return [];
  return [{ kind: "update", table: "tasks", patch: { deleted_at: now }, where: byId(meal.reminder_task_id) }];
}

/** Nuovo pasto. `taskId` è l'id da dare all'eventuale attività di preparazione. */
export function addMealOps(meal: MealKey & { prep_mode: PrepMode; eaten_out?: boolean }, taskId: string, today: LocalDate): Op[] {
  const row = { id: meal.id, date: meal.date, slot: meal.slot, name: meal.name, prep_mode: meal.prep_mode, ...(meal.eaten_out ? { eaten_out: true } : {}) };
  return [{ kind: "insert", table: "meal_plans", row }, ...(meal.prep_mode === "to_prep" ? reminderOps(meal, taskId, today) : [])];
}

/** Pronto ↔ Da preparare. Passando a Pronto l'attività collegata si elimina; tornando a Da preparare se ne crea una nuova. */
export function setModeOps(meal: MealPlan, mode: PrepMode, taskId: string, today: LocalDate, now: string): Op[] {
  if (mode === meal.prep_mode) return [];
  if (mode === "ready") {
    return [
      ...removeReminderOps(meal, now),
      { kind: "update", table: "meal_plans", patch: { prep_mode: "ready", prepared: false, prepared_at: null, reminder_task_id: null }, where: byId(meal.id) },
    ];
  }
  return [{ kind: "update", table: "meal_plans", patch: { prep_mode: "to_prep" }, where: byId(meal.id) }, ...reminderOps(meal, taskId, today)];
}

/** Casella "Preparato" del planner: l'attività collegata, se c'è ancora, segue il pasto. */
export function setPreparedOps(meal: MealPlan, prepared: boolean, now: string): Op[] {
  const ops: Op[] = [
    { kind: "update", table: "meal_plans", patch: { prepared, prepared_at: prepared ? now : null }, where: byId(meal.id) },
  ];
  if (meal.reminder_task_id) {
    ops.push({
      kind: "update",
      table: "tasks",
      patch: prepared ? { status: "done", completed_at: now } : { status: "open", completed_at: null },
      where: byId(meal.reminder_task_id),
    });
  }
  return ops;
}

/** "Mangiato fuori": non c'è niente da preparare, quindi il pasto diventa Pronto e la sua attività si elimina. */
export function setEatenOutOps(meal: MealPlan, out: boolean, now: string): Op[] {
  if (out === meal.eaten_out) return [];
  if (!out) return [{ kind: "update", table: "meal_plans", patch: { eaten_out: false }, where: byId(meal.id) }];
  return [
    ...removeReminderOps(meal, now),
    { kind: "update", table: "meal_plans", patch: { eaten_out: true, prep_mode: "ready", prepared: false, prepared_at: null, reminder_task_id: null }, where: byId(meal.id) },
  ];
}

/** Come si legge un pasto: il suo nome, o "Mangiato fuori" se è fuori e senza nome. */
export function mealTitle(meal: Pick<MealPlan, "name" | "eaten_out">): string {
  return meal.name || (meal.eaten_out ? "Mangiato fuori" : "");
}

/** Cambio del piatto: il nome sta anche nelle note dell'attività collegata. */
export function renameMealOps(meal: MealPlan, name: string): Op[] {
  const ops: Op[] = [{ kind: "update", table: "meal_plans", patch: { name }, where: byId(meal.id) }];
  if (meal.reminder_task_id) ops.push({ kind: "update", table: "tasks", patch: { notes: name }, where: byId(meal.reminder_task_id) });
  return ops;
}

/** Eliminare il pasto elimina anche la sua attività. */
export function removeMealOps(meal: MealPlan, now: string): Op[] {
  return [...removeReminderOps(meal, now), { kind: "delete", table: "meal_plans", where: byId(meal.id) }];
}

type ReminderTask = Pick<Task, "id" | "source" | "meal_plan_id">;

function isReminder(task: ReminderTask): task is ReminderTask & { meal_plan_id: string } {
  return task.source === "meal" && !!task.meal_plan_id;
}

/** Attività di preparazione spuntata (o rimessa da fare) in Today: il pasto la segue. */
export function reminderToggledOps(task: ReminderTask, done: boolean, now: string): Op[] {
  if (!isReminder(task)) return [];
  return [{ kind: "update", table: "meal_plans", patch: { prepared: done, prepared_at: done ? now : null }, where: byId(task.meal_plan_id) }];
}

/** Attività di preparazione eliminata: sparisce solo il promemoria, il pasto resta da preparare. */
export function reminderRemovedOps(task: ReminderTask): Op[] {
  if (!isReminder(task)) return [];
  return [
    {
      kind: "update",
      table: "meal_plans",
      patch: { reminder_task_id: null },
      where: [
        ["id", "eq", task.meal_plan_id],
        ["reminder_task_id", "eq", task.id],
      ],
    },
  ];
}

/** Eliminazione annullata: il promemoria torna collegato al suo pasto. */
export function reminderRestoredOps(task: ReminderTask): Op[] {
  if (!isReminder(task)) return [];
  return [{ kind: "update", table: "meal_plans", patch: { reminder_task_id: task.id }, where: byId(task.meal_plan_id) }];
}

/**
 * Il planner impara: una volta in più per questo piatto in questo momento, con la modalità scelta.
 * Un piatto messo a mano torna tra le Idee. `nutrients` si scrive solo se dato (`null` = di nuovo dal nome).
 */
export function rememberMealOp(
  id: string,
  slot: MealSlot,
  name: string,
  mode: PrepMode,
  known: MealMemory | undefined,
  now: string,
  nutrients?: Nutrient[] | null,
): Op {
  return {
    kind: "insert",
    table: "meal_memory",
    merge: true,
    row: {
      id,
      slot,
      name_normalized: normalizeMealName(name),
      display_name: name,
      default_prep_mode: mode,
      use_count: (known?.use_count ?? 0) + 1,
      last_used_at: now,
      hidden_at: null,
      ...(nutrients === undefined ? {} : { nutrients }),
    },
  };
}

/** Una riga della memoria per un piatto mai messo in questo momento: non conta come uso, quindi non entra tra i ricorrenti. */
function unusedMemoryRow(id: string, slot: MealSlot, name: string, mode: PrepMode) {
  return { id, slot, name_normalized: normalizeMealName(name), display_name: name, default_prep_mode: mode, use_count: 0, last_used_at: null };
}

/**
 * Corregge i nutrienti di un piatto (`null` = di nuovo riconosciuti dal nome). La correzione vale per il piatto,
 * non per il momento: si scrive su tutte le righe della memoria con lo stesso nome. `id` è la riga di questo momento.
 */
export function setNutrientsOps(memory: MealMemory[], id: string, slot: MealSlot, name: string, mode: PrepMode, nutrients: Nutrient[] | null): Op[] {
  const norm = normalizeMealName(name);
  const ops: Op[] = memory
    .filter((m) => m.name_normalized === norm)
    .map((m) => ({ kind: "update", table: "meal_memory", patch: { nutrients }, where: byId(m.id), snapshot: { ...m, nutrients } }));
  if (!memory.some((m) => m.id === id)) {
    ops.push({ kind: "insert", table: "meal_memory", merge: true, row: { ...unusedMemoryRow(id, slot, name, mode), nutrients } });
  }
  return ops;
}

/** "Non proporre": toglie un piatto dalle Idee di un momento (`hiddenAt` nullo lo rimette). */
export function hideIdeaOp(id: string, slot: MealSlot, name: string, mode: PrepMode, known: MealMemory | undefined, hiddenAt: string | null): Op {
  if (known) return { kind: "update", table: "meal_memory", patch: { hidden_at: hiddenAt }, where: byId(known.id), snapshot: { ...known, hidden_at: hiddenAt } };
  return { kind: "insert", table: "meal_memory", merge: true, row: { ...unusedMemoryRow(id, slot, name, mode), hidden_at: hiddenAt } };
}

/** I ricorrenti di un momento, dal più usato; a parità, il più recente. */
export function suggestionsFor(memory: MealMemory[], slot: MealSlot): MealMemory[] {
  return memory
    .filter((m) => m.slot === slot && m.use_count > 0)
    .sort((a, b) => b.use_count - a.use_count || (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""));
}

export type MealDot = "empty" | "ok" | "prep";

/** Puntino della striscia dei giorni: vuoto = non pianificato, a posto, oppure ancora da preparare. */
export function mealDot(meal: Pick<MealPlan, "prep_mode" | "prepared"> | undefined): MealDot {
  if (!meal) return "empty";
  return meal.prep_mode === "to_prep" && !meal.prepared ? "prep" : "ok";
}
