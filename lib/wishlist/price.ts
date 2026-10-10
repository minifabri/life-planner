export type Price = { amount: number; currency: string | null; estimate: boolean };

const SYMBOLS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };
const CODES = ["EUR", "USD", "GBP", "CHF"];

/** "1.299,90" e "1,299.90" → 1299.9; "25" → 25. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(digits)) return null;
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    // Il separatore che viene per ultimo è quello dei decimali.
    normalized = lastComma > lastDot ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = /,\d{1,2}$/.test(digits) ? digits.replace(",", ".") : digits.replace(/,/g, "");
  } else {
    // Un solo punto seguito da tre cifre è un separatore delle migliaia ("1.299").
    normalized = /^\d{1,3}(\.\d{3})+$/.test(digits) ? digits.replace(/\./g, "") : digits;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/**
 * Legge un prezzo scritto a mano o da ChatGPT: "~25 €", "circa 30 euro", "€ 19,90", "25-30 €".
 * Con "~", "circa" o un intervallo il prezzo è indicativo; di un intervallo si tiene il valore più basso.
 */
export function parsePrice(text: string): Price | null {
  const clean = text.trim();
  if (!clean) return null;
  const match = clean.match(/\d[\d.,]*/);
  if (!match) return null;
  const amount = parseAmount(match[0]);
  if (amount === null) return null;
  const upper = clean.toUpperCase();
  const symbol = Object.keys(SYMBOLS).find((s) => clean.includes(s));
  const currency = symbol ? SYMBOLS[symbol] : (CODES.find((c) => upper.includes(c)) ?? (/\bEURO?\b/.test(upper) ? "EUR" : null));
  const range = /\d\s*[-–—]\s*\d/.test(clean) || /\b(da|tra|fra)\b.*\b(a|e)\b/i.test(clean);
  const estimate = range || /[~≈]|circa|intorno|indicativ|sui\b|about|approx/i.test(clean);
  return { amount, currency, estimate };
}

/** "~ 25 €", "19,90 €", "20 USD". */
export function formatPrice(amount: number | null, currency: string | null, estimate: boolean): string | null {
  if (amount === null) return null;
  const number = new Intl.NumberFormat("it-IT", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  const unit = !currency || currency === "EUR" ? "€" : currency;
  return `${estimate ? "~ " : ""}${number} ${unit}`;
}
