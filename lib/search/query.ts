import { addDays, addMonths, endOfMonth, relativeDay, shortDate, trimTime, type LocalDate } from "../dates/local";

/**
 * Ricerca globale e command palette (Product Definition 7.10, technical-design.md 5.3).
 * Qui la parte pura: cosa si cerca, in quale periodo, quali comandi corrispondono, come si descrive un risultato.
 */

export type SearchQuery = {
  /** Testo da cercare, senza le parole che indicano il periodo. */
  text: string;
  from: LocalDate | null;
  to: LocalDate | null;
  /** Periodo riconosciuto, da mostrare ("ottobre 2026"); null se non c'è. */
  period: string | null;
};

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const PERIOD = new RegExp(`(?:^|\\s)(?:(?:di|a|in|nel)\\s+)?(?:(${MONTHS.join("|")})(?:\\s+(?:del\\s+)?(20\\d{2}))?|(20\\d{2}))(?=\\s|$)`, "i");

/** Minuscole, senza accenti e senza spazi doppi: così si confrontano testo cercato e comandi. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Separa il testo dal periodo: "unghie ottobre" cerca "unghie" in ottobre.
 * Un mese senza anno è quello dell'anno in corso; un anno da solo vale da gennaio a dicembre.
 */
export function parseSearchQuery(input: string, today: LocalDate): SearchQuery {
  const clean = input.trim().replace(/\s+/g, " ");
  const match = PERIOD.exec(clean);
  if (!match) return { text: clean, from: null, to: null, period: null };

  const text = `${clean.slice(0, match.index)} ${clean.slice(match.index + match[0].length)}`.trim().replace(/\s+/g, " ");
  const [, monthName, monthYear, yearOnly] = match;
  if (yearOnly) return { text, from: `${yearOnly}-01-01`, to: `${yearOnly}-12-31`, period: yearOnly };

  const month = MONTHS.indexOf(monthName.toLowerCase());
  const year = monthYear ?? today.slice(0, 4);
  const from = addMonths(`${year}-01-01`, month);
  return { text, from, to: endOfMonth(from), period: `${MONTHS[month]} ${year}` };
}

/** Sotto questa lunghezza, senza un periodo, non si interroga il server. */
export const MIN_QUERY_LENGTH = 2;

export function isSearchable(q: SearchQuery): boolean {
  return q.text.length >= MIN_QUERY_LENGTH || q.from !== null;
}

/* ---------------- Comandi ---------------- */

export type Command = {
  id: string;
  label: string;
  /** Altre parole con cui lo si può trovare. */
  keywords: string[];
  /** Pagina da aprire; i comandi senza pagina sono azioni dell'app. */
  href?: string;
};

export const COMMANDS: Command[] = [
  { id: "today", label: "Vai a Oggi", keywords: ["giorno", "agenda"], href: "/today" },
  { id: "week", label: "Vai alla Settimana", keywords: ["calendario"], href: "/calendar/week" },
  { id: "month", label: "Vai al Mese", keywords: ["calendario"], href: "/calendar/month" },
  { id: "shopping", label: "Vai alla Spesa", keywords: ["liste", "lista"], href: "/lists/shopping" },
  { id: "meals", label: "Vai ai Pasti", keywords: ["liste", "menu", "pranzo", "cena"], href: "/lists/meals" },
  { id: "wishlist", label: "Vai alla Wishlist", keywords: ["liste", "desideri"], href: "/lists/wishlist" },
  { id: "log", label: "Vai al Log", keywords: ["registrazioni", "cronologia", "personal"], href: "/log" },
  { id: "workouts", label: "Vai agli Allenamenti", keywords: ["sport", "palestra"], href: "/workouts" },
  { id: "settings", label: "Apri le Impostazioni", keywords: ["preferenze", "notifiche", "tema"], href: "/settings" },
  { id: "theme", label: "Cambia tema", keywords: ["scuro", "chiaro", "aspetto"] },
];

/** Comandi in cui ogni parola scritta è l'inizio di una parola dell'etichetta o delle parole chiave. */
export function matchCommands(input: string, commands: Command[] = COMMANDS): Command[] {
  const words = normalize(input).split(" ").filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const haystack = normalize(`${c.label} ${c.keywords.join(" ")}`).split(" ");
    return words.every((w) => haystack.some((h) => h.startsWith(w)));
  });
}

/* ---------------- Risultati ---------------- */

export type SearchKind = "task" | "event" | "log" | "shopping" | "wishlist" | "meal" | "workout";

/** Una riga restituita da `search_all`. */
export type SearchResult = {
  kind: SearchKind;
  id: string;
  title: string;
  /** Dettaglio che dipende dal tipo: note, categoria, pasto, stato. */
  detail: string | null;
  date: LocalDate | null;
  time: string | null;
  /** Attività completata, articolo già preso, desiderio comprato. */
  done: boolean;
  score: number;
};

export const KIND_LABEL: Record<SearchKind, string> = {
  task: "Attività",
  event: "Eventi",
  log: "Log",
  shopping: "Spesa",
  wishlist: "Wishlist",
  meal: "Pasti",
  workout: "Allenamenti",
};

const KIND_ORDER: SearchKind[] = ["task", "event", "log", "meal", "workout", "shopping", "wishlist"];

/** Risultati raggruppati per tipo; viene prima il gruppo con la corrispondenza migliore. */
export function groupResults(results: SearchResult[]): { kind: SearchKind; items: SearchResult[] }[] {
  const groups = new Map<SearchKind, SearchResult[]>();
  for (const r of results) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r]);
  const best = (items: SearchResult[]) => Math.max(...items.map((i) => i.score));
  return [...groups]
    .map(([kind, items]) => ({ kind, items }))
    .sort((a, b) => best(b.items) - best(a.items) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** "domani · 15:00", "12 set 2025", "fatta · ieri". */
export function resultMeta(r: SearchResult, today: LocalDate): string {
  const parts: string[] = [];
  if (r.done) parts.push(r.kind === "task" ? "fatta" : r.kind === "shopping" ? "presa" : r.kind === "wishlist" ? "comprata" : "fatto");
  if (r.date) {
    const far = r.date < addDays(today, -1) || r.date > addDays(today, 6);
    const otherYear = r.date.slice(0, 4) !== today.slice(0, 4);
    parts.push(far ? `${shortDate(r.date)}${otherYear ? ` ${r.date.slice(0, 4)}` : ""}` : relativeDay(r.date, today));
  }
  if (r.time) parts.push(trimTime(r.time));
  if (r.detail) parts.push(r.detail);
  return parts.join(" · ");
}

/** Dove porta un risultato. Attività ed eventi con una data aprono quel giorno. */
export function resultTarget(r: SearchResult): { href: string; day?: LocalDate } {
  switch (r.kind) {
    case "task":
    case "event":
      return r.date ? { href: "/today", day: r.date } : { href: "/today" };
    case "workout":
      return { href: "/workouts" };
    case "log":
      return { href: "/log" };
    case "shopping":
      return { href: "/lists/shopping" };
    case "wishlist":
      return { href: "/lists/wishlist" };
    case "meal":
      return { href: "/lists/meals" };
  }
}
