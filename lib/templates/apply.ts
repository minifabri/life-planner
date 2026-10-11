import { addDays, diffDays, type LocalDate } from "../dates/local";
import type { Attention, Task, TemplateItem } from "../supabase/types";

/**
 * Template (Product Definition 7.9): un elenco di attività con il giorno espresso come distanza
 * dalla data di partenza. Applicandolo si scelgono la data e nascono le attività.
 */

/** Oltre un anno dalla partenza non è più un template: è un errore di battitura. */
export const MAX_OFFSET = 365;

const ATTENTIONS: Attention[] = ["low", "medium", "high"];

export function emptyItem(dayOffset = 0): TemplateItem {
  return { title: "", day_offset: dayOffset, time: null, duration_min: null, area_id: null, attention: "low" };
}

function byDayAndTime(a: TemplateItem, b: TemplateItem): number {
  // Dentro lo stesso giorno: prima quelle con orario, in ordine; le altre restano come sono state scritte.
  return a.day_offset - b.day_offset || Number(b.time !== null) - Number(a.time !== null) || (a.time ?? "").localeCompare(b.time ?? "");
}

/** Voci pronte da salvare: senza righe vuote, con valori validi, in ordine di giorno e ora. */
export function cleanItems(items: TemplateItem[]): TemplateItem[] {
  return items
    .map((i) => ({
      title: i.title.trim(),
      day_offset: Math.min(MAX_OFFSET, Math.max(0, Math.round(Number(i.day_offset) || 0))),
      time: i.time && /^\d{2}:\d{2}/.test(i.time) ? i.time.slice(0, 5) : null,
      duration_min: i.duration_min && i.duration_min > 0 ? Math.round(i.duration_min) : null,
      area_id: i.area_id || null,
      attention: ATTENTIONS.includes(i.attention) ? i.attention : "low",
    }))
    .filter((i) => i.title !== "")
    .sort(byDayAndTime);
}

/** Legge le voci salvate nel database (jsonb): ciò che non ha la forma attesa viene scartato. */
export function parseItems(raw: unknown): TemplateItem[] {
  if (!Array.isArray(raw)) return [];
  return cleanItems(
    raw
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && typeof (r as { title?: unknown }).title === "string")
      .map((r) => ({
        title: r.title as string,
        day_offset: Number(r.day_offset) || 0,
        time: typeof r.time === "string" ? r.time : null,
        duration_min: typeof r.duration_min === "number" ? r.duration_min : null,
        area_id: typeof r.area_id === "string" ? r.area_id : null,
        attention: r.attention as Attention,
      })),
  );
}

export type TemplateTask = Pick<Task, "title" | "notes" | "date" | "time" | "duration_min" | "due_date" | "window_start" | "attention" | "area_id">;

/**
 * Le attività che nascono applicando il template dal giorno `start`.
 * Un'area che non esiste più (`areaIds`) viene lasciata vuota invece di far fallire il salvataggio.
 */
export function applyTemplate(items: TemplateItem[], start: LocalDate, areaIds?: ReadonlySet<string>): TemplateTask[] {
  return cleanItems(items).map((i) => ({
    title: i.title,
    notes: null,
    date: addDays(start, i.day_offset),
    time: i.time,
    duration_min: i.duration_min,
    due_date: null,
    window_start: null,
    attention: i.attention,
    area_id: i.area_id && (!areaIds || areaIds.has(i.area_id)) ? i.area_id : null,
  }));
}

type SourceTask = Pick<Task, "title" | "date" | "time" | "duration_min" | "area_id" | "attention">;

/** Un template a partire da attività esistenti: il primo giorno diventa la partenza. Quelle senza giorno restano fuori. */
export function itemsFromTasks(tasks: SourceTask[]): TemplateItem[] {
  const dated = tasks.filter((t): t is SourceTask & { date: LocalDate } => !!t.date);
  if (dated.length === 0) return [];
  const first = dated.reduce((min, t) => (t.date < min ? t.date : min), dated[0].date);
  return cleanItems(
    dated.map((t) => ({
      title: t.title,
      day_offset: diffDays(t.date, first),
      time: t.time,
      duration_min: t.duration_min,
      area_id: t.area_id,
      attention: t.attention,
    })),
  );
}

/** "Giorno di partenza", "Il giorno dopo", "Dopo 3 giorni". */
export function offsetLabel(offset: number): string {
  if (offset <= 0) return "Giorno di partenza";
  return offset === 1 ? "Il giorno dopo" : `Dopo ${offset} giorni`;
}

/** "5 attività in 3 giorni", "1 attività". */
export function templateSummary(items: TemplateItem[]): string {
  if (items.length === 0) return "Nessuna attività";
  const span = Math.max(...items.map((i) => i.day_offset)) + 1;
  return span > 1 ? `${items.length} attività in ${span} giorni` : `${items.length} attività`;
}
