// File generato da scripts/build-functions.mjs a partire da lib/chatgpt/edge.ts. Non modificare a mano.

// lib/dates/local.ts
import { TZDate as TZDate2 } from "npm:@date-fns/tz@1.5.0";

// lib/dates/today.ts
import { TZDate } from "npm:@date-fns/tz@1.5.0";
import { format, getISOWeek } from "npm:date-fns@4.4.0";
import { it } from "npm:date-fns@4.4.0/locale";
var DEFAULT_TZ = "Europe/Rome";
function localDateString(now = /* @__PURE__ */ new Date(), tz = DEFAULT_TZ) {
  return format(new TZDate(now, tz), "yyyy-MM-dd");
}

// lib/dates/local.ts
var DAY_MS = 864e5;
function toUtc(d) {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(d, n) {
  return fromUtc(toUtc(d) + n * DAY_MS);
}
function diffDays(a, b) {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}
function fmt(d, options) {
  return new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "UTC" }).format(toUtc(d));
}
function weekdayName(d) {
  return fmt(d, { weekday: "long" });
}
function startOfLocalDay(d, tz = DEFAULT_TZ) {
  return atLocalTime(d, "00:00", tz);
}
function atLocalTime(d, time2, tz = DEFAULT_TZ) {
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = time2.split(":").map(Number);
  return new Date(new TZDate2(y, m - 1, day, hh, mm, 0, tz).getTime());
}
function localTimeString(instant, tz = DEFAULT_TZ) {
  const d = new TZDate2(instant.getTime(), tz);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// cjs-shim:rrule
import pkg from "npm:rrule@2.8.1";
var RRule = pkg.RRule;

// lib/recurrence/expand.ts
function utc(d) {
  return /* @__PURE__ */ new Date(`${d}T00:00:00Z`);
}
function occurrenceDates(rrule, start, from, to) {
  if (to < from || to < start) return [];
  const options = RRule.parseString(rrule.replace(/^RRULE:/i, ""));
  const rule = new RRule({ ...options, dtstart: utc(start) });
  return rule.between(utc(from), utc(to), true).map((d) => d.toISOString().slice(0, 10));
}

// lib/events/day.ts
function eventsForDay(events, exceptions, day, tz = DEFAULT_TZ) {
  const dayStart = startOfLocalDay(day, tz);
  const dayEnd = startOfLocalDay(addDays(day, 1), tz);
  const byEvent = /* @__PURE__ */ new Map();
  for (const ex of exceptions) {
    const map = byEvent.get(ex.event_id) ?? /* @__PURE__ */ new Map();
    map.set(new Date(ex.original_start).getTime(), ex);
    byEvent.set(ex.event_id, map);
  }
  const out = [];
  for (const event of events) {
    if (event.deleted_at) continue;
    const exMap = byEvent.get(event.id);
    if (event.all_day) {
      if (!event.start_date) continue;
      const span = event.end_date && event.end_date > event.start_date ? event.end_date : event.start_date;
      const starts2 = event.rrule ? occurrenceDates(event.rrule, event.start_date, day, day) : event.start_date <= day && day <= span ? [event.start_date] : [];
      for (const d of starts2) {
        const originalStart = startOfLocalDay(d, event.tz);
        if (exMap?.get(originalStart.getTime())?.cancelled) continue;
        out.push({
          key: `${event.id}:${d}`,
          event,
          allDay: true,
          start: null,
          end: null,
          originalStart,
          startTime: null,
          endTime: null,
          durationMin: null
        });
      }
      continue;
    }
    if (!event.start_at) continue;
    const firstStart = new Date(event.start_at);
    const durationMs = event.end_at ? Math.max(0, new Date(event.end_at).getTime() - firstStart.getTime()) : 0;
    let starts;
    if (event.rrule) {
      const startDate = localDateString(firstStart, event.tz);
      const wallTime = localTimeString(firstStart, event.tz);
      starts = occurrenceDates(event.rrule, startDate, addDays(day, -1), addDays(day, 1)).map(
        (d) => atLocalTime(d, wallTime, event.tz)
      );
    } else {
      starts = [firstStart];
    }
    for (const originalStart of starts) {
      const ex = exMap?.get(originalStart.getTime());
      if (ex?.cancelled) continue;
      const start = ex?.new_start_at ? new Date(ex.new_start_at) : originalStart;
      const end = ex?.new_end_at ? new Date(ex.new_end_at) : new Date(start.getTime() + durationMs);
      const overlaps = start < dayEnd && (end > dayStart || start >= dayStart);
      if (!overlaps) continue;
      out.push({
        key: `${event.id}:${originalStart.toISOString()}`,
        event,
        allDay: false,
        start,
        end,
        originalStart,
        startTime: start >= dayStart ? localTimeString(start, tz) : "00:00",
        endTime: event.end_at || ex?.new_end_at ? localTimeString(end, tz) : null,
        durationMin: durationMs ? Math.round((Math.min(end.getTime(), dayEnd.getTime()) - Math.max(start.getTime(), dayStart.getTime())) / 6e4) : null
      });
    }
  }
  return out.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? "")
  );
}

// lib/events/duplicates.ts
var TOLERANCE_MS = 30 * 6e4;
function titleWords(title) {
  return new Set(
    title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
  );
}
function close(a, b) {
  if (!a || !b) return a === b;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= TOLERANCE_MS;
}
function isSameEvent(a, b) {
  if (a.rrule || b.rrule || a.all_day !== b.all_day) return false;
  const sameTime = a.all_day ? a.start_date === b.start_date && (a.end_date ?? a.start_date) === (b.end_date ?? b.start_date) : close(a.start_at, b.start_at) && close(a.end_at ?? a.start_at, b.end_at ?? b.start_at);
  if (!sameTime) return false;
  const words2 = titleWords(b.title);
  return [...titleWords(a.title)].some((w) => words2.has(w));
}
function withoutIcloudDuplicates(events) {
  const google = events.filter((e) => e.source === "gcal" && !e.deleted_at);
  if (google.length === 0) return events;
  return events.filter((e) => e.source !== "icloud" || !google.some((g) => isSameEvent(e, g)));
}

// lib/events/kind.ts
var EMOJI = {
  shipment: ["\u{1F4E6}"],
  travel: ["\u2708", "\u{1F6EB}", "\u{1F6EC}", "\u{1F686}", "\u{1F684}", "\u{1F685}", "\u{1F682}", "\u{1F683}", "\u{1F688}", "\u{1F68C}", "\u{1F68D}", "\u26F4", "\u{1F6A2}", "\u{1F6F3}", "\u{1F9F3}", "\u{1F697}", "\u{1F698}"],
  stay: ["\u{1F3E8}", "\u{1F6CF}", "\u{1F3E1}", "\u{1F3E9}"],
  ticket: ["\u{1F39F}", "\u{1F3AB}", "\u{1F3AD}", "\u{1F3AC}", "\u{1F3B5}", "\u{1F3B6}", "\u{1F3A4}", "\u{1F3B8}", "\u{1F3BB}", "\u{1F5BC}", "\u{1F3DB}", "\u{1F3AA}", "\u{1F3DF}"],
  reservation: ["\u{1F37D}", "\u{1F374}", "\u{1F942}", "\u{1F377}", "\u{1F6CE}"],
  appointment: ["\u{1FA7A}", "\u{1F487}", "\u{1F485}", "\u{1F9B7}", "\u{1F3E5}", "\u{1F486}", "\u{1F488}", "\u{1F469}\u200D\u2695", "\u{1F468}\u200D\u2695", "\u{1F9D1}\u200D\u2695", "\u{1F9D6}"],
  deadline: ["\u23F0", "\u23F3", "\u231B", "\u{1F4B3}", "\u{1F9FE}", "\u{1F4B6}", "\u{1F4B8}", "\u{1F4B0}"]
};
function emojiKind(title) {
  const start = title.trimStart();
  for (const kind of Object.keys(EMOJI)) {
    if (EMOJI[kind].some((e) => start.startsWith(e))) return kind;
  }
  return null;
}
var LEADING_EMOJI = /^\s*[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]+\s*/u;
function words(list) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join("|")})(?![\\p{L}\\p{N}])`, "u");
}
function normalize(text2) {
  return text2.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
var TRAIN = ["tren[oi]", "train", "frecciarossa", "frecciargento", "frecciabianca", "italo", "trenitalia", "intercity", "eurostar", "tgv", "railjet"];
var BUS = ["autobus", "bus", "pullman", "flixbus", "itabus", "navetta", "shuttle"];
var SHIP = ["traghett[oi]", "ferry", "nave", "aliscafo", "catamarano", "crociera", "cruise", "moby", "tirrenia", "grimaldi"];
var CAR = ["noleggio auto", "autonoleggio", "car rental", "rent a car", "hertz", "avis", "europcar", "sixt"];
var PLANE = [
  "vol[oi]",
  "flight",
  "aere[oi]",
  "aeroporto",
  "airport",
  "imbarco",
  "boarding",
  "ryanair",
  "easyjet",
  "wizz ?air",
  "vueling",
  "volotea",
  "lufthansa",
  "ita airways",
  "british airways",
  "air france",
  "klm",
  "aeroitalia",
  "emirates",
  "iberia"
];
var RULES = [
  ["deadline", words(["scadenza", "scadenze", "scade", "scadono", "rinnov[oa]", "rinnovare", "renewal", "deadline"])],
  ["travel", words([...PLANE, ...TRAIN, ...BUS, ...SHIP, ...CAR, "partenza per"])],
  [
    "stay",
    words([
      "hotel",
      "albergo",
      "airbnb",
      "b&b",
      "bed and breakfast",
      "ostello",
      "hostel",
      "resort",
      "agriturismo",
      "casa vacanze",
      "booking\\.com",
      "check[- ]?in",
      "check[- ]?out",
      "soggiorno",
      "pernottamento",
      "dormitorio",
      "stay at"
    ])
  ],
  [
    "ticket",
    words([
      "concert[oi]",
      "concert",
      "cinema",
      "film",
      "teatro",
      "theat(?:re|er)",
      "muse[oi]",
      "museum",
      "mostra",
      "exhibition",
      "spettacolo",
      "bigliett[oi]",
      "tickets?",
      "festival",
      "opera",
      "balletto",
      "musical",
      "stadio",
      "ticketone"
    ])
  ],
  [
    "appointment",
    words([
      "medic[oa]",
      "dottor\\p{L}*",
      "dott",
      "dr",
      "doctor",
      "dentist[ai]?",
      "ortodontist\\p{L}*",
      "visita (?:medica|specialistica|di controllo)",
      "visit[ae] \\p{L}+(?:ic[ahe]|al[ei])",
      "visite mediche",
      "estetista",
      "centro estetico",
      "parrucchier\\p{L}*",
      "barbiere",
      "hairstylist",
      "taglio",
      "piega",
      "manicure",
      "pedicure",
      "ceretta",
      "epilazione",
      "laser",
      "massaggi[oi]",
      "fisioterap\\p{L}*",
      "osteopat\\p{L}*",
      "oculist\\p{L}*",
      "ginecolog\\p{L}*",
      "\\p{L}+olog[oa]",
      "\\p{L}+iatra",
      "dermatolog\\p{L}*",
      "cardiolog\\p{L}*",
      "nutrizionist\\p{L}*",
      "psicolog\\p{L}*",
      "psicoterap\\p{L}*",
      "terapia",
      "analisi del sangue",
      "esami del sangue",
      "prelievo",
      "ecografia",
      "radiografia",
      "vaccino",
      "check-?up",
      "consulenza",
      "consulente",
      "appuntamento",
      "appointment",
      "commercialista",
      "avvocat[oa]",
      "notaio",
      "veterinari[oa]"
    ])
  ],
  [
    "reservation",
    words([
      "ristorante",
      "restaurant",
      "trattoria",
      "osteria",
      "pizzeria",
      "bistrot",
      "tavolo",
      "thefork",
      "the fork",
      "reservation",
      "esperienza",
      "experience",
      "tour",
      "escursione",
      "degustazione",
      "tasting",
      "spa",
      "visita guidata"
    ])
  ],
  ["deadline", words(["pagamento", "pagare", "bollett[ae]", "rata", "assicurazione", "bollo", "tass[ae]", "f24", "imu", "tari", "canone", "abbonamento", "subscription", "revisione auto"])],
  ["reservation", words(["prenotazione", "prenotat[oa]", "booking"])]
];
var TODO = words([
  "preparare",
  "controllare",
  "ricontrollare",
  "verificare",
  "prenotare",
  "cercare",
  "organizzare",
  "confermare",
  "stampare",
  "scaricare",
  "chiamare",
  "comprare",
  "disdire",
  "annullare",
  "ricordare"
]);
var ARROW = /\s*(?:→|->|➝|➔|⟶|⇒)\s*/u;
function kindFromTitle(title) {
  const byEmoji = emojiKind(title);
  if (byEmoji) return byEmoji;
  const text2 = normalize(title.replace(LEADING_EMOJI, ""));
  const [strong, ...rest] = RULES;
  if (strong[1].test(text2)) return strong[0];
  if (TODO.test(text2)) return "event";
  for (const [kind, re] of rest) if (re.test(text2)) return kind;
  if (ARROW.test(text2)) return "travel";
  return "event";
}
function displayTitle(event) {
  if (event.kind === "event" || event.kind === "birthday" || emojiKind(event.title) !== event.kind) return event.title;
  return event.title.replace(LEADING_EMOJI, "").trim() || event.title;
}
var MODE_RULES = [
  ["train", words(TRAIN), ["\u{1F686}", "\u{1F684}", "\u{1F685}", "\u{1F682}", "\u{1F683}", "\u{1F688}"]],
  ["bus", words(BUS), ["\u{1F68C}", "\u{1F68D}"]],
  ["ship", words(SHIP), ["\u26F4", "\u{1F6A2}", "\u{1F6F3}"]],
  ["car", words(CAR), ["\u{1F697}", "\u{1F698}"]]
];
var ROUTE_NOISE = words([...PLANE, ...TRAIN, ...BUS, ...SHIP, "da", "a", "per", "from", "to", "andata", "ritorno", "partenza", "arrivo"]);

// lib/shopping/entry.ts
function normalizeName(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
var UNIT = "kg|hg|g|gr|l|lt|ml|cl|pz|conf|confezioni|confezione|bottiglie|bottiglia|lattine|lattina|vasetti|vasetto|pacchi|pacco|scatole|scatola";
var NUMBER = "\\d+(?:[.,]\\d+)?";
var LEADING = new RegExp(`^(${NUMBER})\\s*(?:(${UNIT})\\b\\.?\\s*(?:di\\s+|d')?|\\s+)(\\S.*)$`, "i");
var TRAILING_TIMES = new RegExp(`^(.*\\S)\\s+(?:x\\s*(\\d+)|(\\d+)\\s*x)$`, "i");
var TRAILING_UNIT = new RegExp(`^(.*\\S)\\s+(${NUMBER})\\s*(${UNIT})\\.?$`, "i");
function quantity(number, unit) {
  return unit ? `${number} ${unit.toLowerCase()}` : number;
}
function parseEntry(text2) {
  const clean = text2.replace(/\s+/g, " ").trim();
  const leading = LEADING.exec(clean);
  if (leading) return { name: leading[3], quantity: quantity(leading[1], leading[2]) };
  const times = TRAILING_TIMES.exec(clean);
  if (times) return { name: times[1], quantity: times[2] ?? times[3] };
  const unit = TRAILING_UNIT.exec(clean);
  if (unit) return { name: unit[1], quantity: quantity(unit[2], unit[3]) };
  return { name: clean, quantity: null };
}

// lib/tasks/classify.ts
function windowStartOf(task, tz = DEFAULT_TZ) {
  return task.window_start ?? localDateString(new Date(task.created_at), tz);
}
function promotionLead(windowStart, due) {
  return diffDays(due, windowStart) <= 7 ? 1 : 3;
}
function isPromoted(task, today, tz = DEFAULT_TZ) {
  if (task.date || !task.due_date || task.due_date < today) return false;
  const lead = promotionLead(windowStartOf(task, tz), task.due_date);
  return today >= addDays(task.due_date, -lead);
}
function classifyTask(task, day, today, tz = DEFAULT_TZ) {
  if (task.deleted_at || task.status === "dismissed") return null;
  if (task.status === "done") {
    if (task.date === day) return task.time ? "agenda" : "todo";
    if (task.completed_at && localDateString(new Date(task.completed_at), tz) === day) return "todo";
    return null;
  }
  if (task.date) {
    if (task.date === day) return task.time ? "agenda" : "todo";
    if (task.date < today && day === today) return "overdue";
    return null;
  }
  if (task.due_date) {
    if (task.due_date < today) return day === today ? "overdue" : null;
    if (day === today) return isPromoted(task, today, tz) ? "todo" : "window";
    return day > today && day === task.due_date ? "todo" : null;
  }
  return null;
}

// lib/wishlist/price.ts
var SYMBOLS = { "\u20AC": "EUR", $: "USD", "\xA3": "GBP" };
var CODES = ["EUR", "USD", "GBP", "CHF"];
function parseAmount(text2) {
  const digits = text2.replace(/[^\d.,]/g, "");
  if (!/\d/.test(digits)) return null;
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let normalized;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastComma > lastDot ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = /,\d{1,2}$/.test(digits) ? digits.replace(",", ".") : digits.replace(/,/g, "");
  } else {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(digits) ? digits.replace(/\./g, "") : digits;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}
function parsePrice(text2) {
  const clean = text2.trim();
  if (!clean) return null;
  const match = clean.match(/\d[\d.,]*/);
  if (!match) return null;
  const amount = parseAmount(match[0]);
  if (amount === null) return null;
  const upper = clean.toUpperCase();
  const symbol = Object.keys(SYMBOLS).find((s) => clean.includes(s));
  const currency = symbol ? SYMBOLS[symbol] : CODES.find((c) => upper.includes(c)) ?? (/\bEURO?\b/.test(upper) ? "EUR" : null);
  const range = /\d\s*[-–—]\s*\d/.test(clean) || /\b(da|tra|fra)\b.*\b(a|e)\b/i.test(clean);
  const estimate = range || /[~≈]|circa|intorno|indicativ|sui\b|about|approx/i.test(clean);
  return { amount, currency, estimate };
}
function formatPrice(amount, currency, estimate) {
  if (amount === null) return null;
  const number = new Intl.NumberFormat("it-IT", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  const unit = !currency || currency === "EUR" ? "\u20AC" : currency;
  return `${estimate ? "~ " : ""}${number} ${unit}`;
}

// lib/chatgpt/actions.ts
var MAX_AGENDA_DAYS = 31;
var MAX_SHOPPING_ITEMS = 50;
var MAX_WISHLIST_ITEMS = 30;
var MAX_TITLE = 200;
var MAX_NOTES = 2e3;
var fail = (error) => ({ ok: false, error });
function isBody(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLocalDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date2 = new Date(Date.UTC(y, m - 1, d));
  return date2.getUTCFullYear() === y && date2.getUTCMonth() === m - 1 && date2.getUTCDate() === d;
}
function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function text(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}
function notes(value) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, MAX_NOTES) : null;
}
function present(body, key) {
  return body[key] !== void 0 && body[key] !== null && body[key] !== "";
}
var ATTENTION = ["low", "medium", "high"];
function plausible(date2, today) {
  return diffDays(date2, today) >= -366 && diffDays(date2, today) <= 5 * 366;
}
function parseTaskInput(body, today) {
  if (!isBody(body)) return fail("Serve un oggetto JSON.");
  const title = text(body.title, MAX_TITLE);
  if (!title) return fail("Manca il titolo dell'attivit\xE0.");
  if (present(body, "date") && !isLocalDate(body.date)) return fail("La data deve essere nel formato AAAA-MM-GG.");
  if (present(body, "due_date") && !isLocalDate(body.due_date)) return fail("La scadenza deve essere nel formato AAAA-MM-GG.");
  const date2 = present(body, "date") ? body.date : null;
  const due = present(body, "due_date") ? body.due_date : null;
  for (const d of [date2, due]) if (d && !plausible(d, today)) return fail(`La data ${d} \xE8 troppo lontana da oggi (${today}).`);
  const time2 = present(body, "time") ? normalizeTime(body.time) : null;
  if (present(body, "time") && !time2) return fail("L'orario deve essere nel formato HH:mm.");
  let duration = null;
  if (present(body, "duration_min")) {
    const n = Number(body.duration_min);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return fail("La durata va in minuti, da 1 a 1440.");
    duration = n;
  }
  if (present(body, "attention") && !ATTENTION.includes(body.attention)) return fail("L'attenzione pu\xF2 essere low, medium o high.");
  const attention2 = present(body, "attention") ? body.attention : "low";
  const inWindow = !date2 && !!due;
  if (inWindow && due < today) return fail("La scadenza \xE8 gi\xE0 passata.");
  return {
    ok: true,
    value: {
      title,
      notes: notes(body.notes),
      date: inWindow ? null : date2 ?? today,
      // Nel periodo l'orario non ha senso: conta solo il giorno entro cui farla.
      time: inWindow ? null : time2,
      duration_min: duration,
      due_date: inWindow ? due : null,
      window_start: inWindow ? today : null,
      attention: attention2,
      remind: body.remind === true,
      source: "manual"
    }
  };
}
function parseEventInput(body, today, tz = DEFAULT_TZ) {
  if (!isBody(body)) return fail("Serve un oggetto JSON.");
  const title = text(body.title, MAX_TITLE);
  if (!title) return fail("Manca il titolo dell'evento.");
  if (!isLocalDate(body.date)) return fail("Serve la data dell'evento, nel formato AAAA-MM-GG.");
  const date2 = body.date;
  if (!plausible(date2, today)) return fail(`La data ${date2} \xE8 troppo lontana da oggi (${today}).`);
  if (present(body, "end_date") && !isLocalDate(body.end_date)) return fail("La data di fine deve essere nel formato AAAA-MM-GG.");
  const endDate = present(body, "end_date") ? body.end_date : null;
  if (endDate && endDate < date2) return fail("La data di fine viene prima dell'inizio.");
  if (endDate && diffDays(endDate, date2) > 60) return fail("Un evento pu\xF2 durare al massimo 60 giorni.");
  const start = present(body, "start_time") ? normalizeTime(body.start_time) : null;
  if (present(body, "start_time") && !start) return fail("L'orario di inizio deve essere nel formato HH:mm.");
  const end = present(body, "end_time") ? normalizeTime(body.end_time) : null;
  if (present(body, "end_time") && !end) return fail("L'orario di fine deve essere nel formato HH:mm.");
  if (end && !start) return fail("C'\xE8 l'orario di fine ma manca quello di inizio.");
  if (present(body, "attention") && !ATTENTION.includes(body.attention)) return fail("L'attenzione pu\xF2 essere low, medium o high.");
  const base = {
    title,
    notes: notes(body.notes),
    location: text(body.location, 300),
    tz,
    attention: present(body, "attention") ? body.attention : "low",
    kind: kindFromTitle(title),
    source: "app"
  };
  if (!start) {
    return { ok: true, value: { ...base, all_day: true, start_date: date2, end_date: endDate, start_at: null, end_at: null } };
  }
  const startAt = atLocalTime(date2, start, tz);
  let endAt = null;
  if (end) {
    const endDay = endDate ?? (end <= start ? addDays(date2, 1) : date2);
    endAt = atLocalTime(endDay, end, tz);
    if (endAt <= startAt) return fail("L'evento finisce prima di iniziare.");
  }
  return {
    ok: true,
    value: { ...base, all_day: false, start_date: null, end_date: null, start_at: startAt.toISOString(), end_at: endAt?.toISOString() ?? null }
  };
}
function items(body, max, what) {
  if (!isBody(body) || !Array.isArray(body.items)) return fail(`Serve un elenco "items" di ${what}.`);
  if (body.items.length === 0) return fail(`L'elenco "items" \xE8 vuoto.`);
  if (body.items.length > max) return fail(`Al massimo ${max} ${what} per volta.`);
  return { ok: true, value: body.items };
}
function planShopping(body, open) {
  const list = items(body, MAX_SHOPPING_ITEMS, "articoli");
  if (!list.ok) return list;
  const seen = new Set(open.map((i) => normalizeName(i.name)));
  const plan = { create: [], already: [] };
  for (const raw of list.value) {
    let entry = null;
    if (typeof raw === "string") {
      const clean = text(raw, MAX_TITLE);
      entry = clean ? parseEntry(clean) : null;
    } else if (isBody(raw)) {
      const name = text(raw.name, MAX_TITLE);
      const quantity2 = typeof raw.quantity === "number" ? String(raw.quantity) : text(raw.quantity, 40);
      entry = name ? quantity2 ? { name, quantity: quantity2 } : parseEntry(name) : null;
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
function httpUrl(value) {
  const raw = text(value, 2e3);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function planWishlist(body, wanted) {
  const list = items(body, MAX_WISHLIST_ITEMS, "prodotti");
  if (!list.ok) return list;
  const key = (name, brand) => `${normalizeName(name)}|${normalizeName(brand ?? "")}`;
  const seen = new Set(wanted.map((w) => key(w.name, w.brand)));
  const plan = { create: [], already: [] };
  for (const raw of list.value) {
    if (!isBody(raw)) return fail("Ogni prodotto deve essere un oggetto con almeno il nome.");
    const name = text(raw.name, MAX_TITLE);
    if (!name) return fail("Ogni prodotto deve avere un nome.");
    const brand = text(raw.brand, 120);
    let amount = null;
    let currency = null;
    let estimate = false;
    let priceNote = null;
    if (typeof raw.price === "number" && Number.isFinite(raw.price) && raw.price > 0) {
      [amount, currency] = [Math.round(raw.price * 100) / 100, "EUR"];
    } else if (typeof raw.price === "string" && raw.price.trim()) {
      const price = parsePrice(raw.price);
      if (price) [amount, currency, estimate] = [price.amount, price.currency ?? "EUR", price.estimate];
      else priceNote = `Prezzo: ${raw.price.trim().slice(0, 60)}`;
    }
    if (raw.price_is_estimate === true) estimate = true;
    const interest = [1, 2, 3].includes(Number(raw.interest)) ? Number(raw.interest) : 2;
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
      source: "chatgpt"
    });
  }
  return { ok: true, value: plan };
}
function parseRange(params, today) {
  const from = params.from || today;
  if (!isLocalDate(from)) return fail("from deve essere nel formato AAAA-MM-GG.");
  const to = params.to || addDays(from, 6);
  if (!isLocalDate(to)) return fail("to deve essere nel formato AAAA-MM-GG.");
  if (to < from) return fail("to viene prima di from.");
  if (diffDays(to, from) + 1 > MAX_AGENDA_DAYS) return fail(`Al massimo ${MAX_AGENDA_DAYS} giorni per richiesta.`);
  return { ok: true, value: { from, to } };
}
function taskOut(task, withDue = false) {
  const out = { title: task.title, time: task.time ? task.time.slice(0, 5) : null, done: task.status === "done", attention: task.attention };
  if (withDue && (task.due_date || task.date)) out.due_date = task.due_date ?? task.original_date ?? task.date;
  if (task.notes) out.notes = task.notes.slice(0, 300);
  return out;
}
function buildAgenda(range, today, tz, tasks, events, exceptions) {
  const visible = withoutIcloudDuplicates(events.filter((e) => !e.is_private && !e.deleted_at));
  const days = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const dayEvents = eventsForDay(visible, exceptions, day, tz).map(
      (o) => ({
        title: displayTitle(o.event),
        all_day: o.allDay,
        start: o.startTime,
        end: o.endTime,
        location: o.event.location,
        kind: o.event.kind
      })
    );
    const dayTasks = tasks.filter((t) => {
      const section = classifyTask(t, day, today, tz);
      return section === "agenda" || section === "todo";
    }).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title)).map((t) => taskOut(t, !t.date));
    days.push({ date: day, weekday: weekdayName(day), events: dayEvents, tasks: dayTasks });
  }
  const agenda = { today, timezone: tz, days };
  if (range.from <= today && today <= range.to) {
    agenda.overdue = tasks.filter((t) => classifyTask(t, today, today, tz) === "overdue").map((t) => taskOut(t, true));
    agenda.in_window = tasks.filter((t) => classifyTask(t, today, today, tz) === "window").map((t) => taskOut(t, true));
  }
  return agenda;
}
function buildLists(shopping, wishlist) {
  return {
    shopping: shopping.map((i) => ({ name: i.name, quantity: i.quantity, department: i.department, urgent: !!i.urgent })),
    wishlist: [...wishlist].sort((a, b) => b.interest - a.interest).map((w) => ({
      name: w.name,
      brand: w.brand,
      category: w.category,
      price: formatPrice(w.price_amount === null ? null : Number(w.price_amount), w.price_currency, w.price_is_estimate),
      interest: w.interest,
      url: w.url
    }))
  };
}
function names(list) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}
function addedMessage(where, created, already) {
  const parts = [];
  if (created.length > 0) parts.push(`Aggiunto alla ${where}: ${names(created)}.`);
  if (already.length > 0) parts.push(`Gi\xE0 in ${where}: ${names(already)}.`);
  return parts.join(" ") || "Niente da aggiungere.";
}
function taskMessage(task, today) {
  if (task.due_date) return `Attivit\xE0 \xAB${task.title}\xBB aggiunta, da fare entro il ${task.due_date}.`;
  const when = task.date === today ? "oggi" : `il ${task.date}`;
  return `Attivit\xE0 \xAB${task.title}\xBB aggiunta per ${when}${task.time ? ` alle ${task.time}` : ""}.`;
}
function eventMessage(event, date2, startTime) {
  return `Evento \xAB${event.title}\xBB aggiunto il ${date2}${startTime ? ` alle ${startTime}` : event.end_date ? ` fino al ${event.end_date}` : ", tutto il giorno"}.`;
}

// lib/chatgpt/openapi.ts
var date = { type: "string", format: "date", description: "Data locale AAAA-MM-GG." };
var time = { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Ora locale HH:mm, nel fuso del profilo." };
var attention = {
  type: "string",
  enum: ["low", "medium", "high"],
  description: "Attenzione: low (normale), medium (notifica), high (importante). Di base low."
};
var reply = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    message: { type: "string", description: "Frase in italiano da riferire a chi usa l'app." }
  }
};
var errorReply = {
  description: "Richiesta non valida: il messaggio dice cosa correggere.",
  content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } }
};
var okReply = (description, extra = {}) => ({
  description,
  content: { "application/json": { schema: { ...reply, properties: { ...reply.properties, ...extra } } } }
});
function openApiSpec(serverUrl) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Life Planner",
      version: "1.0.0",
      description: "Agenda, attivit\xE0, Spesa e Wishlist dell'app Life Planner di chi usa questo GPT."
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "Token personale lp_\u2026 da Impostazioni \u203A ChatGPT." } },
      schemas: {}
    },
    security: [{ token: [] }],
    paths: {
      "/agenda": {
        get: {
          operationId: "getAgenda",
          summary: "Legge eventi e attivit\xE0",
          description: `Eventi e attivit\xE0 giorno per giorno (al massimo ${MAX_AGENDA_DAYS} giorni). Se il periodo comprende oggi, anche le attivit\xE0 rimaste indietro e quelle da fare entro una scadenza. Restituisce anche la data di oggi.`,
          parameters: [
            { name: "from", in: "query", required: false, schema: date, description: "Primo giorno; di base oggi." },
            { name: "to", in: "query", required: false, schema: date, description: "Ultimo giorno compreso; di base 6 giorni dopo from." }
          ],
          responses: {
            "200": {
              description: "Agenda del periodo.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      today: date,
                      timezone: { type: "string" },
                      days: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            date,
                            weekday: { type: "string" },
                            events: { type: "array", items: { type: "object" } },
                            tasks: { type: "array", items: { type: "object" } }
                          }
                        }
                      },
                      overdue: { type: "array", items: { type: "object" } },
                      in_window: { type: "array", items: { type: "object" } }
                    }
                  }
                }
              }
            },
            "400": errorReply
          }
        }
      },
      "/lists": {
        get: {
          operationId: "getLists",
          summary: "Legge Spesa e Wishlist",
          description: "Articoli ancora da comprare nella Spesa (con il reparto, se noto) e prodotti desiderati nella Wishlist (con prezzo e interesse da 1 a 3).",
          responses: {
            "200": {
              description: "Le due liste.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { shopping: { type: "array", items: { type: "object" } }, wishlist: { type: "array", items: { type: "object" } } }
                  }
                }
              }
            }
          }
        }
      },
      "/tasks": {
        post: {
          operationId: "createTask",
          summary: "Aggiunge un'attivit\xE0",
          description: "Crea un'attivit\xE0 da spuntare. Con date \xE8 per quel giorno (con time anche a un orario); con solo due_date \xE8 da fare entro quel giorno; senza nessuna delle due \xE8 per oggi.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string", maxLength: 200 },
                    date,
                    time,
                    duration_min: { type: "integer", minimum: 1, maximum: 1440 },
                    due_date: { ...date, description: "Da fare entro questo giorno, se non c'\xE8 date." },
                    attention,
                    remind: { type: "boolean", description: "Vero per avere una notifica anche con attenzione low." },
                    notes: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "201": okReply("Attivit\xE0 creata.", { id: { type: "string" } }), "400": errorReply }
        }
      },
      "/events": {
        post: {
          operationId: "createEvent",
          summary: "Aggiunge un evento",
          description: "Crea un evento nel calendario dell'app. Senza start_time \xE8 di tutto il giorno (fino a end_date compresa). Un end_time prima dello start_time, senza end_date, \xE8 il giorno dopo.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "date"],
                  properties: {
                    title: { type: "string", maxLength: 200 },
                    date,
                    start_time: time,
                    end_time: time,
                    end_date: { ...date, description: "Ultimo giorno, per eventi su pi\xF9 giorni." },
                    location: { type: "string" },
                    attention,
                    notes: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "201": okReply("Evento creato.", { id: { type: "string" } }), "400": errorReply }
        }
      },
      "/shopping": {
        post: {
          operationId: "addShoppingItems",
          summary: "Aggiunge alla Spesa",
          description: `Aggiunge articoli alla lista della Spesa (al massimo ${MAX_SHOPPING_ITEMS}). Il reparto lo sceglie l'app. Ci\xF2 che \xE8 gi\xE0 in lista non viene duplicato.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: MAX_SHOPPING_ITEMS,
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          name: { type: "string", description: "Nome dell'articolo, es. latte di avena." },
                          quantity: { type: "string", description: "Es. 2, 500 g, 1 l." }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "201": okReply("Articoli aggiunti.", { added: { type: "array", items: { type: "string" } }, already: { type: "array", items: { type: "string" } } }),
            "400": errorReply
          }
        }
      },
      "/wishlist": {
        post: {
          operationId: "addWishlistItems",
          summary: "Salva nella Wishlist",
          description: `Salva prodotti consigliati nella Wishlist come desiderati (al massimo ${MAX_WISHLIST_ITEMS}). Un prodotto gi\xE0 presente con stesso nome e marca non viene duplicato.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array",
                      maxItems: MAX_WISHLIST_ITEMS,
                      items: {
                        type: "object",
                        required: ["name"],
                        properties: {
                          name: { type: "string" },
                          brand: { type: "string" },
                          category: { type: "string", description: "Es. Skincare, Casa, Libri." },
                          price: { type: "string", description: "Prezzo indicativo, es. ~25 \u20AC o 25-30 \u20AC." },
                          url: { type: "string", description: "Link al prodotto, solo se certo." },
                          interest: { type: "integer", enum: [1, 2, 3], description: "1 poco, 2 abbastanza (di base), 3 molto." },
                          notes: { type: "string", description: "Nota breve: perch\xE9 \xE8 consigliato." }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "201": okReply("Prodotti salvati.", { added: { type: "array", items: { type: "string" } }, already: { type: "array", items: { type: "string" } } }),
            "400": errorReply
          }
        }
      }
    }
  };
}

// lib/health/token.ts
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function looksLikeToken(token) {
  return /^lp_[A-Za-z0-9_-]{43}$/.test(token);
}

// lib/ids.ts
function format2(bytes) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function uuidv7(now = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = bytes[6] & 15 | 112;
  bytes[8] = bytes[8] & 63 | 128;
  return format2(bytes);
}
export {
  addedMessage,
  buildAgenda,
  buildLists,
  eventMessage,
  hashToken,
  localDateString,
  looksLikeToken,
  openApiSpec,
  parseEventInput,
  parseRange,
  parseTaskInput,
  planShopping,
  planWishlist,
  taskMessage,
  uuidv7
};
