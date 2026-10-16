import type { LocalDate } from "../dates/local";
import { words } from "../meals/ingredients";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { normalizeName } from "./entry";
import { suggestionScore } from "./list";

/**
 * Frutta e verdura di stagione in Italia, mese per mese (indicativo, per il centro-nord).
 * Ci sono solo i prodotti con una stagione vera: quelli che si trovano buoni tutto l'anno
 * (patate, carote, cipolle, aglio, limoni) e quelli d'importazione (banane, avocado, mango) non ci sono
 * e restano neutri. I nomi alternativi servono a riconoscerli nei pasti e nei prodotti comprati.
 */
export type Produce = { name: string; kind: "fruit" | "vegetable"; months: number[]; aliases: string[] };

const fruit = (name: string, months: number[], ...aliases: string[]): Produce => ({ name, kind: "fruit", months, aliases: [name, ...aliases] });
const veg = (name: string, months: number[], ...aliases: string[]): Produce => ({ name, kind: "vegetable", months, aliases: [name, ...aliases] });

export const PRODUCE: Produce[] = [
  fruit("Arance", [1, 2, 3, 4, 11, 12], "arancia"),
  fruit("Mandarini", [1, 2, 11, 12], "mandarino"),
  fruit("Clementine", [1, 2, 11, 12], "clementina"),
  fruit("Pompelmi", [1, 2, 3, 4, 12], "pompelmo"),
  fruit("Kiwi", [1, 2, 3, 4, 11, 12]),
  fruit("Mele", [1, 2, 3, 8, 9, 10, 11, 12], "mela"),
  fruit("Pere", [1, 2, 8, 9, 10, 11, 12], "pera"),
  fruit("Cachi", [10, 11, 12], "caco", "kaki"),
  fruit("Melagrana", [9, 10, 11, 12], "melagrane", "melograno", "melograni"),
  fruit("Castagne", [9, 10, 11, 12], "castagna"),
  fruit("Uva", [8, 9, 10]),
  fruit("Fichi", [7, 8, 9], "fico"),
  fruit("Fragole", [4, 5, 6], "fragola"),
  fruit("Nespole", [5, 6], "nespola"),
  fruit("Ciliegie", [5, 6, 7], "ciliegia"),
  fruit("Albicocche", [6, 7, 8], "albicocca"),
  fruit("Pesche", [6, 7, 8, 9], "pesca"),
  fruit("Susine", [7, 8, 9], "susina", "prugne", "prugna"),
  fruit("Melone", [6, 7, 8, 9], "meloni"),
  fruit("Anguria", [6, 7, 8], "angurie", "cocomero"),
  fruit("Mirtilli", [6, 7, 8, 9], "mirtillo"),
  fruit("Lamponi", [6, 7, 8, 9], "lampone"),
  fruit("More", [7, 8, 9], "mora"),
  fruit("Frutti di bosco", [6, 7, 8, 9]),

  veg("Asparagi", [3, 4, 5, 6], "asparago"),
  veg("Agretti", [3, 4, 5]),
  veg("Ravanelli", [3, 4, 5, 6], "ravanello"),
  veg("Fave", [4, 5, 6], "fava"),
  veg("Piselli", [4, 5, 6], "pisello"),
  veg("Lattuga", [4, 5, 6, 7, 8, 9]),
  veg("Rucola", [4, 5, 6, 7, 8, 9, 10]),
  veg("Zucchine", [5, 6, 7, 8, 9], "zucchina"),
  veg("Fagiolini", [6, 7, 8, 9], "fagiolino"),
  veg("Pomodori", [6, 7, 8, 9], "pomodoro", "pomodorini", "pomodorino"),
  veg("Melanzane", [6, 7, 8, 9], "melanzana"),
  veg("Peperoni", [6, 7, 8, 9, 10], "peperone"),
  veg("Cetrioli", [6, 7, 8, 9], "cetriolo"),
  veg("Funghi", [9, 10, 11], "fungo"),
  veg("Zucca", [9, 10, 11, 12, 1], "zucche"),
  veg("Patate dolci", [9, 10, 11, 12], "patata dolce"),
  veg("Bietole", [1, 2, 3, 4, 5, 9, 10, 11, 12], "bietola", "biete"),
  veg("Spinaci", [1, 2, 3, 4, 10, 11, 12], "spinacio"),
  veg("Finocchi", [1, 2, 3, 4, 10, 11, 12], "finocchio"),
  veg("Broccoli", [1, 2, 3, 10, 11, 12], "broccolo"),
  veg("Cavolfiore", [1, 2, 3, 10, 11, 12], "cavolfiori"),
  veg("Cavolo nero", [1, 2, 3, 10, 11, 12]),
  veg("Cavolo", [1, 2, 3, 10, 11, 12], "cavoli", "verza", "verze"),
  veg("Cime di rapa", [1, 2, 3, 10, 11, 12], "rapa", "friarielli"),
  veg("Radicchio", [1, 2, 3, 10, 11, 12]),
  veg("Porri", [1, 2, 3, 10, 11, 12], "porro"),
  veg("Topinambur", [1, 2, 3, 10, 11, 12]),
  veg("Cavoletti di Bruxelles", [1, 2, 11, 12], "cavoletti"),
  veg("Carciofi", [1, 2, 3, 4, 5, 11, 12], "carciofo"),
];

export const MONTH_NAME = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function monthOf(date: LocalDate): number {
  return Number(date.slice(5, 7));
}

export function isInSeason(produce: Produce, date: LocalDate): boolean {
  return produce.months.includes(monthOf(date));
}

type Pattern = { produce: Produce; stems: string[] };

// Le frasi più lunghe prima: "cavolo nero" vince su "cavolo", "patate dolci" su niente.
const PATTERNS: Pattern[] = PRODUCE.flatMap((produce) => produce.aliases.map((alias) => ({ produce, stems: words(alias) }))).sort(
  (a, b) => b.stems.length - a.stems.length,
);

/** La frutta e la verdura con una stagione nominate in un testo, una volta sola ciascuna e nell'ordine in cui compaiono. */
export function produceIn(text: string): Produce[] {
  // "Al pomodoro" è un sugo, che si fa tutto l'anno con la passata: non conta come pomodoro fresco.
  const stems = words(normalizeName(text).replace(/\bal pomodoro\b/g, " "));
  const used = new Array<boolean>(stems.length).fill(false);
  const found: { at: number; produce: Produce }[] = [];
  for (const { produce, stems: pattern } of PATTERNS) {
    for (let at = 0; at + pattern.length <= stems.length; at++) {
      if (pattern.some((s, i) => used[at + i] || stems[at + i] !== s)) continue;
      pattern.forEach((_, i) => (used[at + i] = true));
      if (!found.some((f) => f.produce === produce)) found.push({ at, produce });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.produce);
}

export type SeasonalPick = { name: string; produce: Produce; /** Già comprato: il nome è quello dei tuoi acquisti. */ known: boolean };

/**
 * Frutta e verdura di stagione da proporre nella spesa: prima quelle che compri già (con il tuo nome,
 * dalla più usata), poi le altre; frutta e verdura alternate, così nessuna delle due prende tutto lo spazio.
 * Esclude ciò che è già in lista da comprare.
 */
export function seasonalPicks(date: LocalDate, memory: ProductMemory[], items: ShoppingItem[], now: Date): SeasonalPick[] {
  const onList = new Set(items.filter((i) => !i.checked).flatMap((i) => produceIn(i.name)));
  const bought = memory.filter((p) => p.use_count > 0).sort((a, b) => suggestionScore(b, now) - suggestionScore(a, now));
  const inSeason = PRODUCE.filter((p) => isInSeason(p, date) && !onList.has(p) && p.name !== "Frutti di bosco");

  const known: SeasonalPick[] = [];
  for (const product of bought) {
    const match = produceIn(product.display_name).find((p) => inSeason.includes(p));
    if (match && !known.some((k) => k.produce === match)) known.push({ name: product.display_name, produce: match, known: true });
  }
  const rest = inSeason.filter((p) => !known.some((k) => k.produce === p));
  const fruits = rest.filter((p) => p.kind === "fruit");
  const vegetables = rest.filter((p) => p.kind === "vegetable");
  const others: SeasonalPick[] = [];
  while (fruits.length > 0 || vegetables.length > 0) {
    for (const list of [vegetables, fruits]) {
      const next = list.shift();
      if (next) others.push({ name: next.name, produce: next, known: false });
    }
  }
  return [...known, ...others];
}
