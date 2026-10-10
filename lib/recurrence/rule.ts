/** Ricorrenze semplici proposte dall'interfaccia, salvate come RRULE (RFC 5545). */
export type SimpleRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  /** Solo per `weekly`: giorni ISO, 1 = lunedì … 7 = domenica. */
  byDay?: number[];
};

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
export const DAY_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
export const DAY_FULL = DAY_NAMES;

export function toRRule(rule: SimpleRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "weekly" && rule.byDay?.length) {
    const days = [...new Set(rule.byDay)].sort((a, b) => a - b).map((d) => DAY_CODES[d - 1]);
    parts.push(`BYDAY=${days.join(",")}`);
  }
  return parts.join(";");
}

/** Legge una RRULE; restituisce null se usa parti che l'interfaccia non sa mostrare. */
export function parseRRule(rrule: string): SimpleRule | null {
  const fields = new Map(
    rrule
      .replace(/^RRULE:/i, "")
      .split(";")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string]),
  );
  const freq = fields.get("FREQ")?.toLowerCase();
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") return null;
  for (const key of fields.keys()) {
    if (!["FREQ", "INTERVAL", "BYDAY"].includes(key)) return null;
  }
  const rule: SimpleRule = { freq, interval: Number(fields.get("INTERVAL") ?? 1) || 1 };
  const byDay = fields.get("BYDAY");
  if (byDay) {
    const days = byDay.split(",").map((code) => DAY_CODES.indexOf(code) + 1);
    if (freq !== "weekly" || days.includes(0)) return null;
    rule.byDay = days;
  }
  return rule;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** "Ogni giorno", "Ogni lunedì e giovedì", "Ogni 2 settimane", "Ogni mese". */
export function describeRule(rule: SimpleRule): string {
  const n = rule.interval;
  if (rule.freq === "daily") return n === 1 ? "Ogni giorno" : `Ogni ${n} giorni`;
  if (rule.freq === "monthly") return n === 1 ? "Ogni mese" : `Ogni ${n} mesi`;
  const days = joinList((rule.byDay ?? []).slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]));
  if (n === 1) return days ? `Ogni ${days}` : "Ogni settimana";
  return days ? `Ogni ${n} settimane, ${days}` : `Ogni ${n} settimane`;
}

export function describeRRule(rrule: string): string {
  const rule = parseRRule(rrule);
  return rule ? describeRule(rule) : "Si ripete";
}

export function describeAfterCompletion(days: number): string {
  return days === 1 ? "Il giorno dopo il completamento" : `${days} giorni dopo il completamento`;
}
