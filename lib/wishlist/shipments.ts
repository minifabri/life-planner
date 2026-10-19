import { addDays, type LocalDate } from "../dates/local";
import type { Occurrence } from "../events/day";
import { displayTitle } from "../events/kind";
import type { EventRow, WishlistItem, WishlistStatus } from "../supabase/types";
import { byId, type Op } from "../sync/ops";

/**
 * Pacchi arrivati (D71, con D70: chiedere, non decidere). Dal giorno della consegna (evento 📦) l'app chiede
 * in Oggi com'è andata: va bene (l'articolo entra in Acquistati), da restituire (un'attività entro due
 * settimane) o "ci penso più tardi" (l'articolo aspetta in Acquisti › Da decidere). Già dal giorno stesso,
 * perché un pacco può arrivare prima del previsto. Le risposte si salvano sul server (`question_answers`):
 * una domanda a cui si è risposto non torna, né su un altro dispositivo né cancellando l'articolo.
 */

/** Per quanti giorni dopo la spedizione si chiede. */
export const ASK_DAYS = 7;
/** Tempo per restituire un articolo, dal giorno della risposta. */
export const RETURN_DAYS = 14;

export type ShipmentAnswer = "keep" | "return" | "later";

export type ShipmentQuestion = {
  event: EventRow;
  /** Giorno della spedizione (l'ultimo, se l'evento dura più giorni). */
  day: LocalDate;
  /** La consegna è prevista oggi: si può rispondere "Non ancora". */
  today: boolean;
  name: string;
  /** Articolo della wishlist che sembra lo stesso: proposto, si può scollegare. */
  match: WishlistItem | null;
};

/** Chiave di un pacco già deciso (tenuto, da restituire, da decidere): non si chiede più. */
export const answeredKey = (eventId: string) => `ship:${eventId}`;

/** Chiave della risposta "Non è arrivato": con il giorno, così una consegna spostata torna a chiedere. */
export const shipmentKey = (eventId: string, day: LocalDate) => `ship:${eventId}:${day}`;

/** Chiave del "Non ancora" del giorno della consegna: vale solo per oggi, da domani si chiede di nuovo. */
export const waitKey = (eventId: string, today: LocalDate) => `ship:${eventId}:wait:${today}`;

const STOPWORDS = new Set(["del", "della", "dei", "delle", "con", "per", "the", "and", "ordine", "pacco", "spedizione", "consegna", "reso"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * L'articolo desiderato che più somiglia al titolo della spedizione, se ce n'è uno solo:
 * conta le parole in comune con nome e marca. A pari merito non propone niente.
 */
export function matchWanted(title: string, items: WishlistItem[], taken: Set<string> = new Set()): WishlistItem | null {
  const wanted = new Set(words(title));
  if (wanted.size === 0) return null;
  let best: WishlistItem | null = null;
  let bestScore = 0;
  let tie = false;
  for (const item of items) {
    if (item.deleted_at || item.status !== "wanted" || item.shipment_event_id || taken.has(item.id)) continue;
    const score = new Set(words(`${item.name} ${item.brand ?? ""}`).filter((w) => wanted.has(w))).size;
    if (score === 0) continue;
    if (score > bestScore) {
      best = item;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) tie = true;
  }
  return tie ? null : best;
}

/**
 * Le spedizioni di cui chiedere, dalla più recente. `days` sono i giorni da guardare (fino a oggi) con le loro occorrenze.
 * Si salta una spedizione già collegata a un articolo, già decisa, con risposta "Non è arrivato" per quel giorno
 * o "Non ancora" oggi (`answered`: le chiavi delle risposte salvate).
 */
export function shipmentQuestions(
  days: { day: LocalDate; occurrences: Occurrence[] }[],
  items: WishlistItem[],
  answered: Iterable<string>,
  today: LocalDate,
): ShipmentQuestion[] {
  const done = new Set(answered);
  const last = new Map<string, { event: EventRow; day: LocalDate }>();
  for (const { day, occurrences } of days) {
    if (day > today) continue;
    for (const o of occurrences) {
      if (o.event.kind !== "shipment" || o.event.deleted_at) continue;
      const seen = last.get(o.event.id);
      if (!seen || seen.day < day) last.set(o.event.id, { event: o.event, day });
    }
  }
  const linked = new Set(items.filter((i) => i.shipment_event_id).map((i) => i.shipment_event_id));
  const taken = new Set<string>();
  return [...last.values()]
    .filter(
      ({ event, day }) =>
        !linked.has(event.id) &&
        !done.has(answeredKey(event.id)) &&
        !done.has(shipmentKey(event.id, day)) &&
        !(day === today && done.has(waitKey(event.id, today))),
    )
    .sort((a, b) => b.day.localeCompare(a.day) || displayTitle(a.event).localeCompare(displayTitle(b.event), "it"))
    .map(({ event, day }) => {
      const name = displayTitle(event);
      const match = matchWanted(name, items, taken);
      if (match) taken.add(match.id);
      return { event, day, today: day === today, name, match };
    });
}

/** Salva una risposta a una domanda: rifarla non duplica. Restituisce anche la modifica che la toglie. */
export function answerOps(id: string, key: string, answer: string): { ops: Op[]; undo: Op[] } {
  return {
    ops: [{ kind: "insert", table: "question_answers", row: { id, key, answer }, onConflict: "owner_id,key" }],
    undo: [{ kind: "delete", table: "question_answers", where: [["key", "eq", key]] }],
  };
}

export const STATUS_OF: Record<ShipmentAnswer, WishlistStatus> = { keep: "bought", return: "returning", later: "arrived" };

export type ArrivalTarget = {
  /** Articolo esistente (della wishlist o già arrivato); null: se ne crea uno nuovo. */
  item: WishlistItem | null;
  name: string;
  eventId: string | null;
  day: LocalDate | null;
};

export type ArrivalContext = {
  today: LocalDate;
  /** Id da usare per un articolo nuovo, per l'attività di restituzione e per la risposta salvata. */
  itemId: string;
  taskId: string;
  answerId: string;
  listId: string;
  /** Area "Acquisti", se c'è. */
  areaId: string | null;
};

/** Titolo dell'attività di restituzione. */
export const returnTaskTitle = (name: string) => `Restituire ${name}`;

/** Le modifiche per una risposta, e quelle che la annullano. */
export function arrivalOps(target: ArrivalTarget, answer: ShipmentAnswer, ctx: ArrivalContext): { ops: Op[]; undo: Op[] } {
  const ops: Op[] = [];
  const undo: Op[] = [];
  const returning = answer === "return";
  const returnBy = returning ? addDays(ctx.today, RETURN_DAYS) : null;
  const fields = {
    status: STATUS_OF[answer],
    shipment_event_id: target.eventId,
    arrived_on: target.day,
    return_by: returnBy,
    return_task_id: returning ? ctx.taskId : null,
  };

  if (returning) {
    ops.push({
      kind: "insert",
      table: "tasks",
      row: { id: ctx.taskId, title: returnTaskTitle(target.name), due_date: returnBy, window_start: ctx.today, area_id: ctx.areaId, source: "return" },
    });
  }

  if (target.item) {
    const item = target.item;
    // Il nome scelto nella risposta (es. solo l'articolo da restituire) diventa quello dell'articolo.
    const renamed = target.name.trim() && target.name !== item.name ? { name: target.name } : {};
    const patch = { ...fields, ...renamed };
    ops.push({ kind: "update", table: "wishlist_items", patch, where: byId(item.id), snapshot: { ...item, ...patch } });
    const before = {
      ...("name" in renamed ? { name: item.name } : {}),
      status: item.status,
      shipment_event_id: item.shipment_event_id,
      arrived_on: item.arrived_on,
      return_by: item.return_by,
      return_task_id: item.return_task_id,
    };
    undo.push({ kind: "update", table: "wishlist_items", patch: before, where: byId(item.id), snapshot: { ...item } });
  } else {
    ops.push({ kind: "insert", table: "wishlist_items", row: { id: ctx.itemId, list_id: ctx.listId, name: target.name, source: "manual", ...fields } });
    undo.push({ kind: "delete", table: "wishlist_items", where: byId(ctx.itemId) });
  }

  // L'articolo prima, l'attività dopo: l'articolo la nomina.
  if (returning) undo.push({ kind: "delete", table: "tasks", where: byId(ctx.taskId) });

  // La prima risposta su un pacco resta salvata: anche cancellando l'articolo, la domanda non torna.
  if (target.eventId && target.item?.shipment_event_id !== target.eventId) {
    const answered = answerOps(ctx.answerId, answeredKey(target.eventId), answer);
    ops.push(...answered.ops);
    undo.push(...answered.undo);
  }
  return { ops, undo };
}

/**
 * Rinomina un articolo. Se ha un'attività di restituzione con il titolo scritto dall'app, il titolo segue il nome
 * ("Restituire …"); un titolo cambiato a mano resta com'è.
 */
export function renameOps(item: WishlistItem, name: string): Op[] {
  const ops: Op[] = [{ kind: "update", table: "wishlist_items", patch: { name }, where: byId(item.id), snapshot: { ...item, name } }];
  if (item.return_task_id && name !== item.name) {
    ops.push({
      kind: "update",
      table: "tasks",
      patch: { title: returnTaskTitle(name) },
      where: [...byId(item.return_task_id), ["title", "eq", returnTaskTitle(item.name)]],
    });
  }
  return ops;
}

/** "Restituito": l'articolo passa tra i restituiti e la sua attività si chiude. */
export function returnedOps(item: WishlistItem, completedAt: string): { ops: Op[]; undo: Op[] } {
  const ops: Op[] = [{ kind: "update", table: "wishlist_items", patch: { status: "returned" }, where: byId(item.id), snapshot: { ...item, status: "returned" } }];
  const undo: Op[] = [{ kind: "update", table: "wishlist_items", patch: { status: "returning" }, where: byId(item.id), snapshot: { ...item, status: "returning" } }];
  if (item.return_task_id) {
    ops.push({ kind: "update", table: "tasks", patch: { status: "done", completed_at: completedAt }, where: [...byId(item.return_task_id), ["status", "eq", "open"]] });
    undo.push({ kind: "update", table: "tasks", patch: { status: "open", completed_at: null }, where: [...byId(item.return_task_id), ["status", "eq", "done"]] });
  }
  return { ops, undo };
}

/** Gli articoli arrivati in attesa di una decisione, dal più vecchio: aspettano da più tempo. */
export function awaitingDecision(items: WishlistItem[]): WishlistItem[] {
  return items
    .filter((i) => !i.deleted_at && i.status === "arrived")
    .sort((a, b) => (a.arrived_on ?? a.created_at).localeCompare(b.arrived_on ?? b.created_at));
}

/** Resi: prima quelli da restituire (per scadenza), poi i restituiti (dal più recente). */
export function returnItems(items: WishlistItem[]): { returning: WishlistItem[]; returned: WishlistItem[] } {
  const alive = items.filter((i) => !i.deleted_at);
  return {
    returning: alive.filter((i) => i.status === "returning").sort((a, b) => (a.return_by ?? "9999").localeCompare(b.return_by ?? "9999")),
    returned: alive.filter((i) => i.status === "returned").sort((a, b) => (b.arrived_on ?? b.created_at).localeCompare(a.arrived_on ?? a.created_at)),
  };
}

/** I giorni da guardare per le domande: da `ASK_DAYS` giorni fa a oggi. */
export function askDays(today: LocalDate): LocalDate[] {
  return Array.from({ length: ASK_DAYS + 1 }, (_, i) => addDays(today, -ASK_DAYS + i));
}
