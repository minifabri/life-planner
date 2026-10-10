import { addDays, diffDays, type LocalDate } from "../dates/local";
import type { LogCategory, LogEntry, LogStub } from "../supabase/types";

/** Titolo mostrato al posto di una registrazione riservata quando il Log è bloccato (D12). */
export const NEUTRAL_TITLE = "Registrazione riservata";

/** Una riga della cronologia: una registrazione leggibile oppure il segnaposto di una riservata. */
export type TimelineRow = { kind: "entry"; entry: LogEntry } | { kind: "stub"; stub: LogStub };

export type Period = "all" | "30d" | "year";

export type LogFilter = { categoryId: string | null; tag: string | null; period: Period; query: string };

export const NO_FILTER: LogFilter = { categoryId: null, tag: null, period: "all", query: "" };

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Primo giorno compreso nel periodo scelto, o null per "tutto". */
export function periodStart(period: Period, today: LocalDate): LocalDate | null {
  if (period === "30d") return addDays(today, -30);
  if (period === "year") return `${today.slice(0, 4)}-01-01`;
  return null;
}

export function isFiltering(filter: LogFilter): boolean {
  return !!filter.categoryId || !!filter.tag || !!filter.query.trim();
}

/**
 * Le righe della cronologia, dalla più recente. I segnaposto delle registrazioni riservate
 * non hanno categoria, tag né testo: compaiono solo quando non si sta cercando qualcosa di preciso.
 */
export function timelineRows(entries: LogEntry[], stubs: LogStub[], filter: LogFilter, today: LocalDate): TimelineRow[] {
  const from = periodStart(filter.period, today);
  const query = plain(filter.query.trim());
  const visible = entries.filter((e) => {
    if (e.deleted_at) return false;
    if (from && e.date < from) return false;
    if (filter.categoryId && e.category_id !== filter.categoryId) return false;
    if (filter.tag && !e.tags.includes(filter.tag)) return false;
    if (query && !plain([e.title, e.notes ?? "", ...e.tags].join(" ")).includes(query)) return false;
    return true;
  });
  const known = new Set(entries.map((e) => e.id));
  const hidden = isFiltering(filter) ? [] : stubs.filter((s) => !known.has(s.id) && (!from || s.date >= from));
  const rows: (TimelineRow & { date: LocalDate; time: string; created: string })[] = [
    ...visible.map((entry) => ({ kind: "entry" as const, entry, date: entry.date, time: entry.time ?? "", created: entry.created_at })),
    ...hidden.map((stub) => ({ kind: "stub" as const, stub, date: stub.date, time: "", created: "" })),
  ];
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.created.localeCompare(a.created));
  return rows.map((r) => (r.kind === "entry" ? { kind: "entry", entry: r.entry } : { kind: "stub", stub: r.stub }));
}

function rowDate(row: TimelineRow): LocalDate {
  return row.kind === "entry" ? row.entry.date : row.stub.date;
}

/** Raggruppa per mese ("2026-10"), mantenendo l'ordine. */
export function groupByMonth(rows: TimelineRow[]): { month: string; rows: TimelineRow[] }[] {
  const groups: { month: string; rows: TimelineRow[] }[] = [];
  for (const row of rows) {
    const month = rowDate(row).slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

/** "Ottobre 2026" */
export function monthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "oggi", "ieri", "18 giorni fa"; per una data futura "tra 3 giorni". */
export function daysAgoLabel(date: LocalDate, today: LocalDate): string {
  const days = diffDays(today, date);
  if (days === 0) return "oggi";
  if (days === 1) return "ieri";
  if (days === -1) return "domani";
  return days > 0 ? `${days} giorni fa` : `tra ${-days} giorni`;
}

export type LastSeen = {
  category: LogCategory;
  /** Giorno dell'ultima registrazione già avvenuta; null se non ce ne sono. */
  last: LocalDate | null;
  count: number;
  /** La categoria è riservata e il Log è bloccato: l'ultima volta non si mostra. */
  hidden: boolean;
};

/**
 * "Ultima volta" per categoria (D23): solo la data dell'ultima registrazione, nessuna media o previsione.
 * `entries` contiene ciò che è leggibile ora; a Log bloccato le categorie riservate restano nascoste.
 */
export function lastSeenByCategory(categories: LogCategory[], entries: LogEntry[], today: LocalDate, unlocked: boolean): LastSeen[] {
  return categories.map((category) => {
    const own = entries.filter((e) => !e.deleted_at && e.category_id === category.id);
    const past = own.filter((e) => e.date <= today).map((e) => e.date);
    return {
      category,
      last: past.length ? past.reduce((a, b) => (a > b ? a : b)) : null,
      count: own.length,
      hidden: category.is_sensitive && !unlocked,
    };
  });
}

/** I tag usati, dal più frequente. */
export function tagsOf(entries: LogEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) if (!e.deleted_at) for (const tag of e.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/** "Viola, semipermanente , viola" → ["viola", "semipermanente"] */
export function parseTags(text: string): string[] {
  const tags = text
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

/** I giorni in cui c'è almeno una registrazione, riservata o no: per il segno discreto nel calendario (D24). */
export function logDays(entries: LogEntry[], stubs: LogStub[]): Set<LocalDate> {
  return new Set([...entries.filter((e) => !e.deleted_at).map((e) => e.date), ...stubs.map((s) => s.date)]);
}
