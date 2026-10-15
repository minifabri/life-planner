import { addDays, addMonths, endOfMonth, endOfWeek, isoWeekday, nextWeekday, type LocalDate } from "../dates/local";
import type { SimpleRule } from "../recurrence/rule";
import type { Attention } from "../supabase/types";

export type CaptureKind = "task" | "event" | "workout" | "shopping" | "wishlist" | "log";

/** Parte del testo (indici sul testo originale) che ha generato un campo. */
export type Span = { start: number; end: number };

export type SpanField = "kind" | "date" | "time" | "duration" | "window" | "repeat" | "attention" | "category" | "url";

/** Categoria del Log con le parole che la fanno riconoscere (da `log_categories`). */
export type CategoryHint = { id: string; name: string; keywords: string[]; is_sensitive: boolean };

export type ParseOptions = {
  /** Data di riferimento: "oggi" nel fuso del profilo. */
  today: LocalDate;
  /** Ora locale corrente "HH:mm": serve per "tra due ore" e per capire se un orario di oggi è già passato. */
  now?: string;
  categories?: CategoryHint[];
  /** Discipline di allenamento: una frase che comincia con una di queste è un allenamento. */
  activities?: string[];
  /** Tipo scelto a mano dal chip: vince sulle regole e sui prefissi. */
  kind?: CaptureKind;
};

export type ParsedCapture = {
  kind: CaptureKind;
  title: string;
  date: LocalDate | null;
  /** "HH:mm" */
  time: string | null;
  durationMin: number | null;
  /** Fine della finestra per le attività nel periodo ("entro domenica"). */
  windowEnd: LocalDate | null;
  repeat: SimpleRule | null;
  attention: Attention;
  categoryId: string | null;
  sensitive: boolean;
  url: string | null;
  /** "Compleanno Marta 12 ottobre": evento di tutto il giorno che torna ogni anno; il titolo è il nome. */
  birthday: boolean;
  /** "low" quando il tipo è una scelta di default tra più letture possibili. */
  confidence: "high" | "low";
  spans: Partial<Record<SpanField, Span>>;
};

// ---------------------------------------------------------------
// Vocabolario
// ---------------------------------------------------------------
const LETTER = "\\p{L}\\p{N}";

/** Espressione ancorata a parole intere: `\b` non funziona con le lettere accentate. */
function words(src: string): RegExp {
  return new RegExp(`(?<![${LETTER}])(?:${src})(?![${LETTER}])`, "u");
}

const WEEKDAYS = ["luned[iì]", "marted[iì]", "mercoled[iì]", "gioved[iì]", "venerd[iì]", "sabato", "domenica"];
const WD = WEEKDAYS.join("|");
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MONTH = `${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")}|sett`;

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, quindici: 15, venti: 20, trenta: 30,
};
const NUM = `\\d+|un['’]|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")}`;

function toNumber(s: string): number {
  const t = s.replace(/['’]/g, "").trim();
  return /^\d+$/.test(t) ? Number(t) : (NUMBER_WORDS[t] ?? NaN);
}

function weekdayOf(s: string): number {
  return WEEKDAYS.findIndex((w) => new RegExp(`^(?:${w})$`).test(s)) + 1;
}

const PREFIX = new RegExp("^\\s*(?<p>spesa|wishlist|wish|log)\\s*:\\s*");
const PREFIX_KIND: Record<string, CaptureKind> = { spesa: "shopping", wish: "wishlist", wishlist: "wishlist", log: "log" };

const LINK = /https?:\/\/[^\s\u0000]+/;

const REMIND = words("ricorda(?:mi|rmi|rsi)(?:\\s+(?:di|che))?");

const RANGE = words(
  "dalle\\s+(?:ore\\s+)?(?<h1>\\d{1,2})(?:[:.](?<m1>\\d{2}))?\\s+alle\\s+(?:ore\\s+)?(?<h2>\\d{1,2})(?:[:.](?<m2>\\d{2}))?",
);

const RELATIVE = words(
  `(?:tra|fra)\\s+(?:(?<half>mezz['’]?\\s*ora)|(?<n>${NUM})\\s*(?<unit>minuti|minuto|min|ora|ore|giorni|giorno|settimane|settimana|mesi|mese|anni|anno))`,
);

const REPEAT = words(
  `ogni\\s+(?:(?<int>\\d+|due|tre|quattro)\\s+(?<iunit>giorni|settimane|mesi)|(?<simple>giorno|settimana|mese)|(?<days>(?:${WD})(?:\\s*(?:,|e)\\s*(?:${WD}))*))|tutti\\s+i\\s+(?<all>giorni)`,
);

const DATE_CORE =
  `(?<rel>dopodomani|domani|oggi|ieri|stasera|stanotte|stamattina|stamani)` +
  `|(?:quest[oa]\\s+|prossim[oa]\\s+)?(?<wd>${WD})(?:\\s+prossim[oa])?` +
  `|(?<d>\\d{1,2})/(?<m>\\d{1,2})(?:/(?<y>\\d{4}|\\d{2}))?` +
  `|(?<d2>\\d{1,2}|primo)°?\\s+(?:di\\s+)?(?<mon>${MONTH})(?:\\s+(?<y2>\\d{4}))?`;

const DATE = words(
  `(?:per\\s+)?(?:il\\s+|l['’]\\s*|di\\s+)?(?:${DATE_CORE})` +
    // "il 20" da solo vale come data solo a fine frase o prima di un orario: "il 2 di picche" resta testo.
    `|(?:il|giorno)\\s+(?<bare>\\d{1,2})(?=\\s*(?:$|[,;.\\u0000]|alle\\s|all['’]|ore\\s|dalle\\s))`,
);

const WINDOW = words(
  `entro\\s+(?:(?<wn>${NUM})\\s+(?<wunit>giorni|giorno|settimane|settimana|mesi|mese)|(?:il\\s+|l['’]\\s*|la\\s+)?(?:${DATE_CORE}|(?<bare>\\d{1,2})))` +
    `|(?:entro\\s+|a\\s+|per\\s+)?(?:la\\s+)?fine\\s+(?:del\\s+|della\\s+|dell['’]\\s*)?(?<fine>mese|settimana|anno)`,
);

const TIME = words(
  `(?:a\\s+)?(?<noon>mezzogiorno)` +
    `|(?:alle\\s+(?:ore\\s+)?|all['’]\\s*|ore\\s+|verso\\s+le\\s+|per\\s+le\\s+)(?<h>\\d{1,2}|una)(?:[:.,](?<min>\\d{2}))?(?:\\s+e\\s+(?<frac>mezz[ao]|un\\s+quarto|tre\\s+quarti|\\d{1,2}))?` +
    `|(?<hb>\\d{1,2}):(?<minb>\\d{2})`,
);

const DAY_PART = new RegExp(`^\\s+(?:(?:di|in|del)\\s+)?(?<part>mattina|mattinata|pomeriggio|sera|serata|notte)(?![${LETTER}])`, "u");

const DURATION = words(
  `(?:per\\s+)?(?:(?<half>mezz['’]?\\s*ora)` +
    `|(?<hn>${NUM})\\s*(?:ora|ore)(?:\\s+e\\s+(?:(?<hx>mezz[ao]|un\\s+quarto)|(?<hxm>\\d{1,2})(?:\\s*min(?:uti)?)?))?` +
    `|(?<mn>\\d{1,3})\\s*(?:minuti|minuto|min|['′])` +
    `|(?<hh>\\d{1,2})\\s*h\\s*(?<hm>\\d{2})?)`,
);

const DANGLING = new RegExp(`(?<![${LETTER}])(?:il|lo|la|per|a|di|e|alle|entro|da)\\s*(?=\\u0000)`, "u");

/**
 * "Compleanno (di) Marta" o "Marta compleanno": resta il nome. "Regalo per il compleanno" no.
 * Basta "compleanno" all'inizio, anche mentre si scrive: nome e giorno arrivano dopo.
 */
const BIRTHDAY = new RegExp(
  "^compleanno(?:\\s+(?:(?:di|del|della|dello|dei|degli|delle)(?:\\s+|$)|(?:dell|d)['’]\\s*)?(?<who>.*))?$|^(?<who2>.+?)(?<!(?:^|\\s)(?:il|lo|la|per|di|del|della|dello|al|alla|un|mio|mia|tuo|tua|suo|sua|buon))\\s+compleanno$",
  "iu",
);

const BUY = /^(?:comprare|comprami|compra|acquistare)\s+(?:(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\s+|(?:dell|l|un)['’]\s*)?/i;

/** Parole che finiscono come un infinito ma sono nomi: "Parrucchiere giovedì alle 10" è un evento. */
const NOT_VERBS = new Set([
  "mare", "pere", "sere", "gare", "are", "bare", "zanzare", "cellulare", "familiare", "militare", "alimentare",
  "particolare", "titolare", "collare", "altare", "piacere", "dovere", "potere", "carattere", "genere", "cenere",
  "polvere", "lettere", "camere", "tessere", "opere", "sfere", "lire", "concerti", "coperti", "aperti", "esperti",
  "taverne", "lanterne", "moderne", "esterne", "interne",
]);
const SHORT_VERBS = new Set([
  "farlo", "farla", "farli", "farle", "farsi", "farmi", "dirlo", "dirle", "dirgli", "darlo", "darle", "dargli",
  "porre", "proporre", "disporre", "comporre", "esporre", "imporre", "supporre", "trarre", "estrarre", "sottrarre",
  "distrarre", "condurre", "produrre", "ridurre", "tradurre", "introdurre", "compiere",
]);

/** La frase comincia con un verbo all'infinito ("Prenotare…", "Chiamarla…"): è qualcosa da fare. */
function startsWithVerb(title: string): boolean {
  const first = title.toLowerCase().match(/^[\p{L}]+/u)?.[0];
  if (!first) return false;
  if (SHORT_VERBS.has(first)) return true;
  if (NOT_VERBS.has(first) || first.endsWith("iere")) return false;
  return /^\p{L}+(?:ar|er|ir)e$/u.test(first) || /^\p{L}{3,}(?:ar|er|ir)(?:mi|ti|si|ci|vi|lo|la|li|le|ne|gli)$/u.test(first);
}

// ---------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------
type DayPart = "morning" | "afternoon" | "evening" | "night";
const PARTS: Record<string, DayPart> = {
  mattina: "morning", mattinata: "morning", pomeriggio: "afternoon", sera: "evening", serata: "evening", notte: "night",
};

type Ctx = {
  /** Testo con la grafia originale e testo in minuscolo, della stessa lunghezza; le parti già lette sono sostituite da \u0000. */
  orig: string;
  low: string;
  spans: ParsedCapture["spans"];
};

const MASK = "\u0000";

function mask(ctx: Ctx, start: number, end: number) {
  const blank = MASK.repeat(end - start);
  ctx.orig = ctx.orig.slice(0, start) + blank + ctx.orig.slice(end);
  ctx.low = ctx.low.slice(0, start) + blank + ctx.low.slice(end);
}

/** Segna come letta la parte trovata e ne ricorda la posizione per il campo. */
function consume(ctx: Ctx, m: RegExpExecArray, field: SpanField, extra = 0) {
  const span = { start: m.index, end: m.index + m[0].length + extra };
  mask(ctx, span.start, span.end);
  ctx.spans[field] ??= span;
}

/** "di sera", "mattina", "pomeriggio" subito dopo una data o un orario. */
function takeDayPart(ctx: Ctx, from: number): { part: DayPart; length: number } | null {
  const m = DAY_PART.exec(ctx.low.slice(from));
  return m ? { part: PARTS[m.groups!.part], length: m[0].length } : null;
}

function validDate(y: number, m: number, d: number): LocalDate | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

type DateRead = { date: LocalDate; /** La stessa espressione letta al passato, per le registrazioni. */ past: LocalDate; part?: DayPart };

function readDate(g: Record<string, string | undefined>, today: LocalDate): DateRead | null {
  const [ty, tm] = today.split("-").map(Number);

  if (g.rel) {
    const offset = { dopodomani: 2, domani: 1, ieri: -1 }[g.rel] ?? 0;
    const part: DayPart | undefined =
      g.rel === "stasera" || g.rel === "stanotte" ? "evening" : g.rel.startsWith("stama") ? "morning" : undefined;
    const date = addDays(today, offset);
    return { date, past: date, part };
  }

  if (g.wd) {
    const wd = weekdayOf(g.wd);
    const next = nextWeekday(today, wd);
    return { date: next, past: isoWeekday(today) === wd ? today : addDays(next, -7) };
  }

  if (g.fine) {
    const date = g.fine === "mese" ? endOfMonth(today) : g.fine === "settimana" ? endOfWeek(today) : `${ty}-12-31`;
    return { date, past: date };
  }

  if (g.bare) {
    const day = Number(g.bare);
    let date: LocalDate | null = null;
    for (let i = 0; i < 12 && !date; i++) {
      const candidate = validDate(ty + Math.floor((tm - 1 + i) / 12), ((tm - 1 + i) % 12) + 1, day);
      if (candidate && candidate >= today) date = candidate;
    }
    let past: LocalDate | null = null;
    for (let i = 0; i < 12 && !past; i++) {
      const candidate = validDate(ty + Math.floor((tm - 1 - i) / 12), ((((tm - 1 - i) % 12) + 12) % 12) + 1, day);
      if (candidate && candidate <= today) past = candidate;
    }
    return date ? { date, past: past ?? date } : null;
  }

  const dayText = g.d ?? g.d2;
  if (!dayText) return null;
  const day = dayText === "primo" ? 1 : Number(dayText);
  const month = g.m ? Number(g.m) : MONTHS.findIndex((name) => name.startsWith(g.mon!.slice(0, 3))) + 1;
  const yearText = g.y ?? g.y2;
  if (yearText) {
    const date = validDate(yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText), month, day);
    return date ? { date, past: date } : null;
  }
  // Senza anno: la prossima volta che capita (o l'ultima, per le registrazioni).
  const thisYear = validDate(ty, month, day);
  if (thisYear && thisYear >= today) return { date: thisYear, past: thisYear === today ? today : (validDate(ty - 1, month, day) ?? thisYear) };
  const nextYear = validDate(ty + 1, month, day);
  if (thisYear) return { date: nextYear ?? thisYear, past: thisYear };
  return nextYear ? { date: nextYear, past: nextYear } : null;
}

/**
 * Ora scritta → minuti dalla mezzanotte. Senza indicazioni, le ore da 1 a 6 sono del pomeriggio
 * ("alle 3" = 15:00); scrivere "03:00" o "di mattina" le lascia com'è.
 */
function toMinutes(hourText: string, minutes: number, part: DayPart | undefined): number | null {
  const hour = hourText === "una" ? 1 : Number(hourText);
  if (hour > 23 || minutes > 59) return null;
  let h = hour;
  if (part === "evening" || part === "afternoon") {
    if (h >= 1 && h < 12) h += 12;
  } else if (!part && h >= 1 && h <= 6 && !hourText.startsWith("0")) {
    h += 12;
  }
  return h * 60 + minutes;
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const FRACTIONS: Record<string, number> = { mezza: 30, mezzo: 30, "un quarto": 15, "tre quarti": 45 };

function stripAccents(s: string): string {
  return s.replace(/[À-ſ]/g, (c) => c.normalize("NFD")[0]);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Interpreta una frase del Quick Capture con regole locali (D13): nessuna rete, nessuna AI.
 * Tutto ciò che non viene riconosciuto resta nel titolo: non si scarta e non si inventa nulla.
 */
export function parseCapture(input: string, options: ParseOptions): ParsedCapture {
  const { today, now, categories = [], activities = [] } = options;
  const orig = input.normalize("NFC");
  // Minuscolo carattere per carattere, così gli indici restano quelli del testo originale.
  const low = Array.from(orig, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join("");
  const ctx: Ctx = { orig, low, spans: {} };

  let m: RegExpExecArray | null;
  let prefixKind: CaptureKind | null = null;
  let url: string | null = null;
  let reminded = false;
  let date: DateRead | null = null;
  let relativeDate = false;
  let windowEnd: LocalDate | null = null;
  let minutes: number | null = null;
  let durationMin: number | null = null;
  let repeat: SimpleRule | null = null;
  let part: DayPart | undefined;
  let ranged = false;
  let unread: Span | null = null;

  if ((m = PREFIX.exec(ctx.low))) {
    prefixKind = PREFIX_KIND[m.groups!.p];
    consume(ctx, m, "kind");
  }

  if ((m = LINK.exec(ctx.orig))) {
    url = m[0].replace(/[.,;)]+$/, "");
    consume(ctx, m, "url");
  }

  if ((m = REMIND.exec(ctx.low))) {
    reminded = true;
    consume(ctx, m, "attention");
  }

  // "dalle 17 alle 18": orario e durata insieme.
  if ((m = RANGE.exec(ctx.low))) {
    const g = m.groups!;
    const start = toMinutes(g.h1, Number(g.m1 ?? 0), undefined);
    let end = toMinutes(g.h2, Number(g.m2 ?? 0), undefined);
    if (start !== null && end !== null) {
      if (end <= start && end + 720 > start && end + 720 < 1440) end += 720;
      minutes = start;
      ranged = true;
      if (end > start) durationMin = end - start;
      ctx.spans.duration = { start: m.index, end: m.index + m[0].length };
      consume(ctx, m, "time");
    }
  }

  // "tra tre mesi", "fra 10 giorni", "tra un'ora".
  if ((m = RELATIVE.exec(ctx.low))) {
    const g = m.groups!;
    const n = g.half ? 30 : toNumber(g.n!);
    const unit = g.half ? "min" : g.unit!;
    if (/^(min|ora|ore)/.test(unit)) {
      if (now && minutes === null) {
        const [h, mi] = now.split(":").map(Number);
        const total = h * 60 + mi + n * (unit.startsWith("min") ? 1 : 60);
        const day = addDays(today, Math.floor(total / 1440));
        date = { date: day, past: day };
        minutes = total % 1440;
        relativeDate = true;
        ctx.spans.time = { start: m.index, end: m.index + m[0].length };
        consume(ctx, m, "date");
      } else {
        // Senza ora corrente non si può calcolare: resta testo, e non va letto come durata.
        unread = { start: m.index, end: m.index + m[0].length };
      }
    } else {
      const day = unit.startsWith("giorn")
        ? addDays(today, n)
        : unit.startsWith("settiman")
          ? addDays(today, n * 7)
          : addMonths(today, unit.startsWith("ann") ? n * 12 : n);
      date = { date: day, past: day };
      relativeDate = true;
      consume(ctx, m, "date");
    }
  }

  // "ogni lunedì e giovedì", "ogni giorno", "ogni 2 settimane".
  if ((m = REPEAT.exec(ctx.low))) {
    const g = m.groups!;
    if (g.days) {
      const byDay = [...g.days.matchAll(new RegExp(WD, "g"))].map((d) => weekdayOf(d[0]));
      repeat = { freq: "weekly", interval: 1, byDay: [...new Set(byDay)].sort((a, b) => a - b) };
    } else if (g.int) {
      const freq = g.iunit!.startsWith("giorn") ? "daily" : g.iunit!.startsWith("settiman") ? "weekly" : "monthly";
      repeat = { freq, interval: toNumber(g.int) };
    } else {
      const simple = g.simple ?? "giorno";
      repeat = { freq: simple === "giorno" ? "daily" : simple === "settimana" ? "weekly" : "monthly", interval: 1 };
    }
    consume(ctx, m, "repeat");
  }

  // "entro domenica", "entro fine mese", "entro il 20".
  if ((m = WINDOW.exec(ctx.low))) {
    const g = m.groups!;
    if (g.wn) {
      const n = toNumber(g.wn);
      windowEnd = g.wunit!.startsWith("giorn") ? addDays(today, n) : g.wunit!.startsWith("settiman") ? addDays(today, n * 7) : addMonths(today, n);
    } else {
      windowEnd = readDate(g, today)?.date ?? null;
    }
    if (windowEnd) consume(ctx, m, "window");
  }

  if (!date && (m = DATE.exec(ctx.low))) {
    const read = readDate(m.groups!, today);
    if (read) {
      date = read;
      part = read.part;
      const after = takeDayPart(ctx, m.index + m[0].length);
      if (after) part = after.part;
      consume(ctx, m, "date", after?.length ?? 0);
    }
  }

  // "stasera dalle 8 alle 10": l'intervallo è già stato letto, la sera lo sposta dopo mezzogiorno.
  if (ranged && minutes !== null && minutes < 720 && (part === "evening" || part === "afternoon")) minutes += 720;

  if (minutes === null && (m = TIME.exec(ctx.low))) {
    const g = m.groups!;
    const after = takeDayPart(ctx, m.index + m[0].length);
    const timePart = after?.part ?? part;
    let read: number | null;
    if (g.noon) read = 720;
    else if (g.hb) read = toMinutes(g.hb, Number(g.minb), timePart);
    else {
      const extra = g.frac ? (FRACTIONS[g.frac.replace(/\s+/g, " ")] ?? Number(g.frac)) : 0;
      read = toMinutes(g.h!, Number(g.min ?? 0) + extra, timePart);
    }
    if (read !== null) {
      minutes = read;
      consume(ctx, m, "time", after?.length ?? 0);
    }
  }

  if (durationMin === null && (m = DURATION.exec(ctx.low)) && !(unread && m.index >= unread.start && m.index < unread.end)) {
    const g = m.groups!;
    let read: number;
    if (g.half) read = 30;
    else if (g.hn) read = toNumber(g.hn) * 60 + (g.hx ? FRACTIONS[g.hx.replace(/\s+/g, " ")] : Number(g.hxm ?? 0));
    else if (g.mn) read = Number(g.mn);
    else read = Number(g.hh) * 60 + Number(g.hm ?? 0);
    if (read > 0 && read <= 1440) {
      durationMin = read;
      consume(ctx, m, "duration");
    }
  }

  // Parole chiave del Log: la prima categoria, nell'ordine dato, che ne contiene una.
  let category: CategoryHint | null = null;
  const plain = stripAccents(ctx.low);
  for (const c of categories) {
    for (const keyword of c.keywords) {
      const found = words(escapeRegExp(stripAccents(keyword.toLowerCase()))).exec(plain);
      if (found && !category) {
        category = c;
        ctx.spans.category = { start: found.index, end: found.index + found[0].length };
      }
    }
  }

  // Quel che resta è il titolo.
  // Le parole di collegamento rimaste appese a una parte già letta ("cena e [domani]") se ne vanno con lei.
  let hanging: RegExpExecArray | null;
  while ((hanging = DANGLING.exec(ctx.low))) mask(ctx, hanging.index, hanging.index + hanging[0].length);
  let rest = ctx.orig.replace(/\u0000+/g, " ").replace(/\s+/g, " ").replace(/\s+([,;.])/g, "$1").trim();
  rest = rest.replace(/^[\s,;:.\-–—]+/, "").replace(/[\s,;:\-–—]+$/, "");
  if (reminded) rest = rest.replace(/^(?:di|che)\s+/i, "");

  const verb = startsWithVerb(rest);
  const buys = BUY.test(rest);
  const hasWhen = !!date || minutes !== null || !!windowEnd || !!repeat;
  // "Corsa domani alle 18": la disciplina deve aprire la frase, così "Scarpe da corsa" resta ciò che è.
  // Con una ripetizione resta un'attività o un evento: gli allenamenti non si ripetono da soli.
  const plainRest = stripAccents(rest.toLowerCase());
  const looksLikeWorkout =
    !reminded && !windowEnd && !repeat && !buys &&
    activities.some((a) => a.trim() && new RegExp(`^${escapeRegExp(stripAccents(a.trim().toLowerCase()))}(?![${LETTER}])`, "u").test(plainRest));
  // Un compleanno ha un giorno e nient'altro: con un orario è una festa, un evento come gli altri.
  const birthdayOf = BIRTHDAY.exec(rest);
  // A fine frase ("Torta compleanno") vale solo con una data.
  const looksLikeBirthday =
    !!birthdayOf && (birthdayOf.groups!.who2 === undefined || !!date) && minutes === null && !repeat && !windowEnd && !reminded && !prefixKind && !url;
  const looksLikeLog = !!category && !verb && !reminded && !windowEnd && !repeat && !relativeDate && (!date || date.date <= today);

  let kind: CaptureKind;
  let confidence: ParsedCapture["confidence"] = "high";
  if (options.kind) kind = options.kind;
  else if (prefixKind) kind = prefixKind;
  else if (url) kind = "wishlist";
  else if (looksLikeBirthday) kind = "event";
  else if (buys && !hasWhen) {
    // "Comprare mascara": spesa di default, il chip lo sposta in Wishlist.
    kind = "shopping";
    confidence = "low";
  } else if (looksLikeWorkout) kind = "workout";
  else if (looksLikeLog) {
    kind = "log";
    if (!date) confidence = "low";
  } else if (reminded) kind = "task";
  else if (minutes !== null && !verb && !windowEnd) kind = "event";
  else {
    kind = "task";
    if (date && !verb && !windowEnd) confidence = "low";
  }

  const birthday = looksLikeBirthday && kind === "event";
  let title = birthday ? capitalize((birthdayOf!.groups!.who ?? birthdayOf!.groups!.who2 ?? "").trim()) : rest;
  if (kind === "shopping" || kind === "wishlist") title = title.replace(BUY, "");
  if (kind !== "shopping") title = capitalize(title);
  if (!title && url) {
    try {
      title = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      title = url;
    }
  }

  // Una registrazione è già successa: "lunedì" e "3/10" si leggono al passato.
  let day = date ? (kind === "log" && !relativeDate ? date.past : date.date) : null;
  const time = minutes === null ? null : hhmm(minutes);
  if (repeat && !day) {
    // La prima volta: oggi, o il primo dei giorni indicati.
    day = repeat.byDay?.length && !repeat.byDay.includes(isoWeekday(today))
      ? repeat.byDay.map((wd) => nextWeekday(today, wd)).sort()[0]
      : today;
  }
  if (kind === "workout" && !day) day = today;
  if (time && !day && kind !== "log") {
    // Solo l'orario: oggi, oppure domani se oggi è già passato.
    day = now && time <= now && !windowEnd ? addDays(today, 1) : today;
  }
  if (kind === "log" && !day) day = today;

  return {
    kind,
    title,
    date: day,
    time,
    durationMin,
    windowEnd,
    repeat,
    attention: reminded ? "medium" : "low",
    categoryId: category?.id ?? null,
    sensitive: category?.is_sensitive ?? false,
    url,
    birthday,
    confidence,
    spans: ctx.spans,
  };
}
