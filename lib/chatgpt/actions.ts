// Azioni del GPT personalizzato (technical-design.md, 9.9): controllo delle richieste di ChatGPT, righe da scrivere
// e risposte da leggere. Tutto puro: la Edge Function `chatgpt-actions` fa solo le query e chiama queste funzioni.
import { addDays, atLocalTime, diffDays, weekdayName, type LocalDate } from "../dates/local";
import { DEFAULT_TZ } from "../dates/today";
import { eventsForDay } from "../events/day";
import { withoutIcloudDuplicates } from "../events/duplicates";
import { displayTitle, kindFromTitle } from "../events/kind";
import { normalizeName, parseEntry } from "../shopping/entry";
import type { Attention, EventException, EventRow, EventKind, Task } from "../supabase/types";
import { classifyTask } from "../tasks/classify";
import { formatPrice, parsePrice } from "../wishlist/price";

export const MAX_AGENDA_DAYS = 31;
export const MAX_SHOPPING_ITEMS = 50;
export const MAX_WISHLIST_ITEMS = 30;
const MAX_TITLE = 200;
const MAX_NOTES = 2000;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/* ---------------- Controlli di base ---------------- */

type Body = Record<string, unknown>;

function isBody(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Data reale "AAAA-MM-GG" (niente 31 febbraio). */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Ora "HH:mm" (anche "9:30" e "09:30:00"), restituita come "HH:mm". */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Testo ripulito e accorciato; null se vuoto o se non è testo. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

/** Note: si tengono gli a capo. */
function notes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, MAX_NOTES) : null;
}

function present(body: Body, key: string): boolean {
  return body[key] !== undefined && body[key] !== null && body[key] !== "";
}

const ATTENTION: Attention[] = ["low", "medium", "high"];

/** Una data ragionevole: da un anno fa a cinque anni avanti. */
function plausible(date: LocalDate, today: LocalDate): boolean {
  return diffDays(date, today) >= -366 && diffDays(date, today) <= 5 * 366;
}

/* ---------------- Attività ---------------- */

export type TaskRow = Pick<Task, "title" | "notes" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "attention" | "remind"> & {
  source: "manual";
};

/**
 * Un'attività chiesta a ChatGPT. Con `due_date` e senza `date` è "nel periodo" (da fare entro quel giorno);
 * senza nessuna delle due è per oggi, perché un'attività senza giorno non comparirebbe da nessuna parte.
 */
export function parseTaskInput(body: unknown, today: LocalDate): Result<TaskRow> {
  if (!isBody(body)) return fail("Serve un oggetto JSON.");
  const title = text(body.title, MAX_TITLE);
  if (!title) return fail("Manca il titolo dell'attività.");

  if (present(body, "date") && !isLocalDate(body.date)) return fail("La data deve essere nel formato AAAA-MM-GG.");
  if (present(body, "due_date") && !isLocalDate(body.due_date)) return fail("La scadenza deve essere nel formato AAAA-MM-GG.");
  const date = present(body, "date") ? (body.date as LocalDate) : null;
  const due = present(body, "due_date") ? (body.due_date as LocalDate) : null;
  for (const d of [date, due]) if (d && !plausible(d, today)) return fail(`La data ${d} è troppo lontana da oggi (${today}).`);

  const time = present(body, "time") ? normalizeTime(body.time) : null;
  if (present(body, "time") && !time) return fail("L'orario deve essere nel formato HH:mm.");

  let duration: number | null = null;
  if (present(body, "duration_min")) {
    const n = Number(body.duration_min);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return fail("La durata va in minuti, da 1 a 1440.");
    duration = n;
  }

  if (present(body, "attention") && !ATTENTION.includes(body.attention as Attention)) return fail("L'attenzione può essere low, medium o high.");
  const attention = (present(body, "attention") ? body.attention : "low") as Attention;

  const inWindow = !date && !!due;
  if (inWindow && due! < today) return fail("La scadenza è già passata.");
  return {
    ok: true,
    value: {
      title,
      notes: notes(body.notes),
      date: inWindow ? null : (date ?? today),
      // Nel periodo l'orario non ha senso: conta solo il giorno entro cui farla.
      time: inWindow ? null : time,
      duration_min: duration,
      due_date: inWindow ? due : null,
      window_start: inWindow ? today : null,
      attention,
      remind: body.remind === true,
      source: "manual",
    },
  };
}

/* ---------------- Eventi ---------------- */

export type EventRowInput = Pick<
  EventRow,
  "title" | "notes" | "location" | "start_at" | "end_at" | "all_day" | "start_date" | "end_date" | "tz" | "attention"
> & { kind: EventKind; source: "app" };

/**
 * Un evento chiesto a ChatGPT, con data e ore locali nel fuso del profilo.
 * Senza `start_time` è di tutto il giorno (fino a `end_date` compresa, se c'è).
 */
export function parseEventInput(body: unknown, today: LocalDate, tz: string = DEFAULT_TZ): Result<EventRowInput> {
  if (!isBody(body)) return fail("Serve un oggetto JSON.");
  const title = text(body.title, MAX_TITLE);
  if (!title) return fail("Manca il titolo dell'evento.");
  if (!isLocalDate(body.date)) return fail("Serve la data dell'evento, nel formato AAAA-MM-GG.");
  const date = body.date;
  if (!plausible(date, today)) return fail(`La data ${date} è troppo lontana da oggi (${today}).`);
  if (present(body, "end_date") && !isLocalDate(body.end_date)) return fail("La data di fine deve essere nel formato AAAA-MM-GG.");
  const endDate = present(body, "end_date") ? (body.end_date as LocalDate) : null;
  if (endDate && endDate < date) return fail("La data di fine viene prima dell'inizio.");
  if (endDate && diffDays(endDate, date) > 60) return fail("Un evento può durare al massimo 60 giorni.");

  const start = present(body, "start_time") ? normalizeTime(body.start_time) : null;
  if (present(body, "start_time") && !start) return fail("L'orario di inizio deve essere nel formato HH:mm.");
  const end = present(body, "end_time") ? normalizeTime(body.end_time) : null;
  if (present(body, "end_time") && !end) return fail("L'orario di fine deve essere nel formato HH:mm.");
  if (end && !start) return fail("C'è l'orario di fine ma manca quello di inizio.");

  if (present(body, "attention") && !ATTENTION.includes(body.attention as Attention)) return fail("L'attenzione può essere low, medium o high.");
  const base = {
    title,
    notes: notes(body.notes),
    location: text(body.location, 300),
    tz,
    attention: (present(body, "attention") ? body.attention : "low") as Attention,
    kind: kindFromTitle(title),
    source: "app" as const,
  };

  if (!start) {
    return { ok: true, value: { ...base, all_day: true, start_date: date, end_date: endDate, start_at: null, end_at: null } };
  }
  const startAt = atLocalTime(date, start, tz);
  let endAt: Date | null = null;
  if (end) {
    // Un orario di fine prima dell'inizio, senza data di fine, è il giorno dopo ("22:00–01:00").
    const endDay = endDate ?? (end <= start ? addDays(date, 1) : date);
    endAt = atLocalTime(endDay, end, tz);
    if (endAt <= startAt) return fail("L'evento finisce prima di iniziare.");
  }
  return {
    ok: true,
    value: { ...base, all_day: false, start_date: null, end_date: null, start_at: startAt.toISOString(), end_at: endAt?.toISOString() ?? null },
  };
}

/* ---------------- Spesa ---------------- */

export type ShoppingRowInput = { name: string; quantity: string | null };

export type ShoppingPlan = { create: ShoppingRowInput[]; already: string[] };

function items(body: unknown, max: number, what: string): Result<unknown[]> {
  if (!isBody(body) || !Array.isArray(body.items)) return fail(`Serve un elenco "items" di ${what}.`);
  if (body.items.length === 0) return fail(`L'elenco "items" è vuoto.`);
  if (body.items.length > max) return fail(`Al massimo ${max} ${what} per volta.`);
  return { ok: true, value: body.items };
}

/**
 * Articoli da aggiungere alla Spesa. Un articolo è una stringa ("2 latte di avena") o `{ name, quantity }`.
 * Ciò che è già in lista e non spuntato non si aggiunge di nuovo; il reparto lo mette il database.
 */
export function planShopping(body: unknown, open: { name: string }[]): Result<ShoppingPlan> {
  const list = items(body, MAX_SHOPPING_ITEMS, "articoli");
  if (!list.ok) return list;
  const seen = new Set(open.map((i) => normalizeName(i.name)));
  const plan: ShoppingPlan = { create: [], already: [] };
  for (const raw of list.value) {
    let entry: ShoppingRowInput | null = null;
    if (typeof raw === "string") {
      const clean = text(raw, MAX_TITLE);
      entry = clean ? parseEntry(clean) : null;
    } else if (isBody(raw)) {
      const name = text(raw.name, MAX_TITLE);
      const quantity = typeof raw.quantity === "number" ? String(raw.quantity) : text(raw.quantity, 40);
      entry = name ? (quantity ? { name, quantity } : parseEntry(name)) : null;
    }
    if (!entry || !entry.name) return fail("Ogni articolo deve avere un nome.");
    const key = normalizeName(entry.name);
    if (seen.has(key)) {
      plan.already.push(entry.name);
      continue;
    }
    seen.add(key);
    plan.create.push(entry);
  }
  return { ok: true, value: plan };
}

/* ---------------- Wishlist ---------------- */

export type WishlistRowInput = {
  name: string;
  brand: string | null;
  category: string | null;
  url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  price_is_estimate: boolean;
  notes: string | null;
  interest: 1 | 2 | 3;
  source: "chatgpt";
};

export type WishlistPlan = { create: WishlistRowInput[]; already: string[] };

function httpUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Prodotti da salvare nella Wishlist come "desiderati", con `source = 'chatgpt'`.
 * Il prezzo può essere un numero (euro) o un testo come "~25 €" o "25-30 €" (indicativo, D21).
 * Un prodotto già tra i desiderati, con lo stesso nome e la stessa marca, non si aggiunge di nuovo.
 */
export function planWishlist(body: unknown, wanted: { name: string; brand: string | null }[]): Result<WishlistPlan> {
  const list = items(body, MAX_WISHLIST_ITEMS, "prodotti");
  if (!list.ok) return list;
  const key = (name: string, brand: string | null) => `${normalizeName(name)}|${normalizeName(brand ?? "")}`;
  const seen = new Set(wanted.map((w) => key(w.name, w.brand)));
  const plan: WishlistPlan = { create: [], already: [] };
  for (const raw of list.value) {
    if (!isBody(raw)) return fail("Ogni prodotto deve essere un oggetto con almeno il nome.");
    const name = text(raw.name, MAX_TITLE);
    if (!name) return fail("Ogni prodotto deve avere un nome.");
    const brand = text(raw.brand, 120);

    let amount: number | null = null;
    let currency: string | null = null;
    let estimate = false;
    let priceNote: string | null = null;
    if (typeof raw.price === "number" && Number.isFinite(raw.price) && raw.price > 0) {
      [amount, currency] = [Math.round(raw.price * 100) / 100, "EUR"];
    } else if (typeof raw.price === "string" && raw.price.trim()) {
      const price = parsePrice(raw.price);
      if (price) [amount, currency, estimate] = [price.amount, price.currency ?? "EUR", price.estimate];
      // Un prezzo illeggibile resta nella nota, come nell'import da testo (9.4).
      else priceNote = `Prezzo: ${raw.price.trim().slice(0, 60)}`;
    }
    if (raw.price_is_estimate === true) estimate = true;

    const interest = [1, 2, 3].includes(Number(raw.interest)) ? (Number(raw.interest) as 1 | 2 | 3) : 2;
    const note = [notes(raw.notes), priceNote].filter(Boolean).join("\n") || null;

    const k = key(name, brand);
    if (seen.has(k)) {
      plan.already.push(brand ? `${name} (${brand})` : name);
      continue;
    }
    seen.add(k);
    plan.create.push({
      name,
      brand,
      category: text(raw.category, 80),
      url: httpUrl(raw.url),
      price_amount: amount,
      price_currency: amount === null ? null : currency,
      price_is_estimate: amount === null ? false : estimate,
      notes: note,
      interest,
      source: "chatgpt",
    });
  }
  return { ok: true, value: plan };
}

/* ---------------- Agenda ---------------- */

export type AgendaRange = { from: LocalDate; to: LocalDate };

/** Periodo richiesto: di base da oggi per 7 giorni, al massimo 31. */
export function parseRange(params: { from?: string | null; to?: string | null }, today: LocalDate): Result<AgendaRange> {
  const from = params.from || today;
  if (!isLocalDate(from)) return fail("from deve essere nel formato AAAA-MM-GG.");
  const to = params.to || addDays(from, 6);
  if (!isLocalDate(to)) return fail("to deve essere nel formato AAAA-MM-GG.");
  if (to < from) return fail("to viene prima di from.");
  if (diffDays(to, from) + 1 > MAX_AGENDA_DAYS) return fail(`Al massimo ${MAX_AGENDA_DAYS} giorni per richiesta.`);
  return { ok: true, value: { from, to } };
}

export type AgendaTask = Pick<
  Task,
  "id" | "title" | "notes" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "attention" | "status" | "completed_at" | "original_date" | "created_at" | "deleted_at"
>;

export type AgendaEventOut = {
  title: string;
  all_day: boolean;
  start: string | null;
  end: string | null;
  location: string | null;
  kind: EventKind;
};

export type AgendaTaskOut = { title: string; time: string | null; done: boolean; attention: Attention; due_date?: LocalDate; notes?: string };

export type AgendaDay = { date: LocalDate; weekday: string; events: AgendaEventOut[]; tasks: AgendaTaskOut[] };

export type Agenda = {
  today: LocalDate;
  timezone: string;
  days: AgendaDay[];
  /** Solo se il periodo comprende oggi: le attività rimaste indietro e quelle da fare entro una scadenza. */
  overdue?: AgendaTaskOut[];
  in_window?: AgendaTaskOut[];
};

function taskOut(task: AgendaTask, withDue = false): AgendaTaskOut {
  const out: AgendaTaskOut = { title: task.title, time: task.time ? task.time.slice(0, 5) : null, done: task.status === "done", attention: task.attention };
  if (withDue && (task.due_date || task.date)) out.due_date = (task.due_date ?? task.original_date ?? task.date)!;
  if (task.notes) out.notes = task.notes.slice(0, 300);
  return out;
}

/** L'agenda giorno per giorno, con le stesse regole di Oggi e del Calendario (classifyTask, eventsForDay). */
export function buildAgenda(
  range: AgendaRange,
  today: LocalDate,
  tz: string,
  tasks: AgendaTask[],
  events: EventRow[],
  exceptions: EventException[],
): Agenda {
  const visible = withoutIcloudDuplicates(events.filter((e) => !e.is_private && !e.deleted_at));
  const days: AgendaDay[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const dayEvents = eventsForDay(visible, exceptions, day, tz).map(
      (o): AgendaEventOut => ({
        title: displayTitle(o.event),
        all_day: o.allDay,
        start: o.startTime,
        end: o.endTime,
        location: o.event.location,
        kind: o.event.kind,
      }),
    );
    const dayTasks = tasks
      .filter((t) => {
        const section = classifyTask(t, day, today, tz);
        return section === "agenda" || section === "todo";
      })
      .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title))
      .map((t) => taskOut(t, !t.date));
    days.push({ date: day, weekday: weekdayName(day), events: dayEvents, tasks: dayTasks });
  }
  const agenda: Agenda = { today, timezone: tz, days };
  if (range.from <= today && today <= range.to) {
    agenda.overdue = tasks.filter((t) => classifyTask(t, today, today, tz) === "overdue").map((t) => taskOut(t, true));
    agenda.in_window = tasks.filter((t) => classifyTask(t, today, today, tz) === "window").map((t) => taskOut(t, true));
  }
  return agenda;
}

/* ---------------- Liste ---------------- */

export type ListsOut = {
  shopping: { name: string; quantity: string | null; department: string | null; urgent: boolean }[];
  wishlist: { name: string; brand: string | null; category: string | null; price: string | null; interest: number; url: string | null }[];
};

export function buildLists(
  shopping: { name: string; quantity: string | null; department: string | null; urgent: boolean | null }[],
  wishlist: { name: string; brand: string | null; category: string | null; price_amount: number | string | null; price_currency: string | null; price_is_estimate: boolean; interest: number; url: string | null }[],
): ListsOut {
  return {
    shopping: shopping.map((i) => ({ name: i.name, quantity: i.quantity, department: i.department, urgent: !!i.urgent })),
    wishlist: [...wishlist]
      .sort((a, b) => b.interest - a.interest)
      .map((w) => ({
        name: w.name,
        brand: w.brand,
        category: w.category,
        price: formatPrice(w.price_amount === null ? null : Number(w.price_amount), w.price_currency, w.price_is_estimate),
        interest: w.interest,
        url: w.url,
      })),
  };
}

/* ---------------- Messaggi ---------------- */

function names(list: string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

export function addedMessage(where: "Spesa" | "Wishlist", created: string[], already: string[]): string {
  const parts: string[] = [];
  if (created.length > 0) parts.push(`Aggiunto alla ${where}: ${names(created)}.`);
  if (already.length > 0) parts.push(`Già in ${where}: ${names(already)}.`);
  return parts.join(" ") || "Niente da aggiungere.";
}

export function taskMessage(task: TaskRow, today: LocalDate): string {
  if (task.due_date) return `Attività «${task.title}» aggiunta, da fare entro il ${task.due_date}.`;
  const when = task.date === today ? "oggi" : `il ${task.date}`;
  return `Attività «${task.title}» aggiunta per ${when}${task.time ? ` alle ${task.time}` : ""}.`;
}

export function eventMessage(event: EventRowInput, date: LocalDate, startTime: string | null): string {
  return `Evento «${event.title}» aggiunto il ${date}${startTime ? ` alle ${startTime}` : event.end_date ? ` fino al ${event.end_date}` : ", tutto il giorno"}.`;
}
