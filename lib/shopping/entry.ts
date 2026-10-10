/** Nome per i confronti: minuscolo, senza accenti, spazi singoli. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Entry = { name: string; quantity: string | null };

const UNIT = "kg|hg|g|gr|l|lt|ml|cl|pz|conf|confezioni|confezione|bottiglie|bottiglia|lattine|lattina|vasetti|vasetto|pacchi|pacco|scatole|scatola";
const NUMBER = "\\d+(?:[.,]\\d+)?";
// "2 latte", "500 g farina", "1,5 kg di patate"
const LEADING = new RegExp(`^(${NUMBER})\\s*(?:(${UNIT})\\b\\.?\\s*(?:di\\s+|d')?|\\s+)(\\S.*)$`, "i");
// "latte x2", "latte 2x", "farina 500 g"
const TRAILING_TIMES = new RegExp(`^(.*\\S)\\s+(?:x\\s*(\\d+)|(\\d+)\\s*x)$`, "i");
const TRAILING_UNIT = new RegExp(`^(.*\\S)\\s+(${NUMBER})\\s*(${UNIT})\\.?$`, "i");

function quantity(number: string, unit?: string): string {
  return unit ? `${number} ${unit.toLowerCase()}` : number;
}

/**
 * Separa la quantità dal nome in ciò che viene scritto ("2 latte", "latte x2", "500 g farina").
 * Un numero che fa parte del nome resta nel nome ("farina 00", "7up").
 */
export function parseEntry(text: string): Entry {
  const clean = text.replace(/\s+/g, " ").trim();
  const leading = LEADING.exec(clean);
  if (leading) return { name: leading[3], quantity: quantity(leading[1], leading[2]) };
  const times = TRAILING_TIMES.exec(clean);
  if (times) return { name: times[1], quantity: times[2] ?? times[3] };
  const unit = TRAILING_UNIT.exec(clean);
  if (unit) return { name: unit[1], quantity: quantity(unit[2], unit[3]) };
  return { name: clean, quantity: null };
}
