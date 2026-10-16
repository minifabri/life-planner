import type { LocalDate } from "../dates/local";
import type { MealMemory, MealPlan, Nutrient } from "../supabase/types";
import { foodIndex } from "./food-index";
import { mealFoods, normalizeMealName } from "./rules";

/**
 * Nutrienti dei pasti, riconosciuti dal nome del piatto con un dizionario locale di alimenti.
 * È un'indicazione qualitativa: dice quali nutrienti porta un piatto, non quanti grammi.
 * Ciò che il nome non dice (le quantità) non si può sapere: per questo ogni piatto si può correggere
 * a mano (`meal_memory.nutrients`). I condimenti del pasto (`meal_plans.condiments`) si aggiungono al piatto.
 */

export const NUTRIENTS: Nutrient[] = ["protein", "carbs", "fat", "fiber"];

export const NUTRIENT_LABEL: Record<Nutrient, string> = {
  protein: "Proteine",
  carbs: "Carboidrati",
  fat: "Grassi",
  fiber: "Fibre",
};

const CODE: Record<string, Nutrient> = { P: "protein", C: "carbs", G: "fat", F: "fiber" };

/**
 * Alimenti per nutrienti portati (P proteine, C carboidrati, G grassi, F fibre), separati da virgola.
 * Come si scrivono le voci: `foodIndex`.
 */
const FOODS: [string, string][] = [
  ["C", "=pasta, spaghetti, penne, fusilli, rigatoni, tagliatelle, linguine, orecchiette, gnocchi, riso, risotto, polenta, pane, panino, toast, crostini, bruschetta, crackers, gallette, grissini, fette biscottate, cereali, patata, pancake, crepes, marmellata, miele, cous, couscous, tortilla, ravioli, tortellini, noodles, udon"],
  ["CF", "farro, orzo, bulgur, avena, porridge, muesli, segale, banana, castagne, mais"],
  ["CG", "piadina, focaccia, biscotti, torta, crostata, brioche, cornetto, croissant, gelato, cioccolato, cioccolata, patatine, pasta sfoglia"],
  ["CGP", "pizza, lasagne, cannelloni, carbonara, quiche, torta salata"],
  ["CGF", "granola"],
  ["CPF", "quinoa, lenticchie, ceci, fagioli, piselli, fave, lupini, legumi, edamame, falafel, minestrone, grano saraceno"],
  ["P", "pollo, tacchino, manzo, vitello, bistecca, carne, tagliata, polpette, maiale, coniglio, prosciutto, bresaola, tonno, merluzzo, =pesce, =pesci, orata, branzino, spigola, sogliola, platessa, gamberi, gamberetti, calamari, =polpo, seppie, cozze, vongole, yogurt, skyr, latte, kefir, tofu, tempeh, seitan, =soia, albume, fiocchi latte, proteine, proteico"],
  ["PG", "salmone, sgombro, sardine, alici, acciughe, uovo, uova, frittata, omelette, formaggio, mozzarella, ricotta, parmigiano, =grana, pecorino, feta, burrata, stracchino, scamorza, caprino, gorgonzola, hamburger, burger, salsiccia, salame, speck, pancetta, mortadella, wurstel, ragu"],
  ["PGF", "hummus"],
  ["G", "olio, burro, panna, pesto, maionese, tahina, besciamella, mascarpone, cocco"],
  ["GF", "avocado, guacamole, olive, noci, mandorle, nocciole, anacardi, pistacchi, arachidi, pinoli, semi, frutta secca"],
  ["F", "verdura, verdure, insalata, lattuga, zucchina, melanzana, peperone, pomodoro, pomodorini, spinaci, broccoli, cavolfiore, cavolo, cavoletti, carota, finocchio, fagiolini, zucca, fungo, carciofo, asparagi, bietola, cicoria, rucola, radicchio, sedano, cetriolo, porro, cipolla, rapa, barbabietola, verza, vellutata, zuppa, passato, crudites, frutta, mela, =pera, =pere, arancia, mandarino, kiwi, fragola, mirtilli, lamponi, frutti bosco, =pesca, =pesche, albicocca, prugna, uva, melone, anguria, ananas, fichi, macedonia, integrale, integrali, crusca"],
];

const findNutrients = foodIndex(FOODS.map(([codes, foods]): [Nutrient[], string] => [[...codes].map((c) => CODE[c]), foods]));

function inOrder(found: Set<Nutrient>): Nutrient[] {
  return NUTRIENTS.filter((n) => found.has(n));
}

/** I nutrienti che il nome del piatto lascia riconoscere, sempre nello stesso ordine. Vuoto se non dice nulla. */
export function recognizeNutrients(name: string): Nutrient[] {
  return inOrder(findNutrients(name));
}

/** Le correzioni fatte a mano, per nome del piatto: valgono in qualunque momento della giornata. */
export type Overrides = Map<string, Nutrient[]>;

export function nutrientOverrides(memory: MealMemory[]): Overrides {
  const overrides: Overrides = new Map();
  for (const m of memory) if (m.nutrients) overrides.set(m.name_normalized, m.nutrients);
  return overrides;
}

/** I nutrienti di un piatto: la correzione fatta a mano, se c'è, altrimenti quelli riconosciuti dal nome. */
export function nutrientsOf(name: string, overrides?: Overrides): Nutrient[] {
  const chosen = overrides?.get(normalizeMealName(name));
  return chosen ? inOrder(new Set(chosen)) : recognizeNutrients(name);
}

/** I nutrienti di un pasto: quelli del piatto, più quelli dei suoi condimenti. */
export function mealNutrients(meal: Pick<MealPlan, "name"> & { condiments?: string }, overrides?: Overrides): Nutrient[] {
  const dish = meal.name ? nutrientsOf(meal.name, overrides) : [];
  return meal.condiments ? inOrder(new Set([...dish, ...recognizeNutrients(meal.condiments)])) : dish;
}

/** Il pasto dice cosa si è mangiato: ha un piatto o dei condimenti. Un pasto fuori senza nulla scritto non conta. */
export function hasFoods(meal: Pick<MealPlan, "name"> & { condiments?: string }): boolean {
  return !!mealFoods(meal);
}

export function sameNutrients(a: Nutrient[], b: Nutrient[]): boolean {
  return a.length === b.length && a.every((n) => b.includes(n));
}

/** Sotto questa quota dei pasti riconosciuti un nutriente è "poco". I grassi stanno più in basso: il condimento spesso non si scrive. */
const LOW_SHARE: Record<Nutrient, number> = { protein: 0.5, carbs: 0.5, fat: 0.25, fiber: 0.5 };

/** Con meno pasti riconosciuti di così non si dà un giudizio. */
export const MIN_MEALS = 4;

export type BalanceRow = {
  nutrient: Nutrient;
  /** In quanti pasti della settimana compare. */
  meals: number;
  /** In quanti pasti di ciascun giorno, nell'ordine di `days`. */
  perDay: number[];
  low: boolean;
};

export type Balance = {
  planned: number;
  /** I pasti di cui si conosce almeno un nutriente: il giudizio si basa su questi. */
  recognized: number;
  rows: BalanceRow[];
};

/** Come si distribuiscono i nutrienti nei pasti dei giorni dati. Gli extra contano come un pasto; un pasto fuori senza nulla scritto non conta. */
export function weekBalance(meals: MealPlan[], days: LocalDate[], overrides?: Overrides): Balance {
  const inWeek = meals.filter((m) => hasFoods(m) && days.includes(m.date)).map((m) => ({ date: m.date, nutrients: mealNutrients(m, overrides) }));
  const recognized = inWeek.filter((m) => m.nutrients.length > 0).length;
  const rows = NUTRIENTS.map((nutrient) => {
    const perDay = days.map((d) => inWeek.filter((m) => m.date === d && m.nutrients.includes(nutrient)).length);
    const count = perDay.reduce((a, b) => a + b, 0);
    return { nutrient, meals: count, perDay, low: recognized >= MIN_MEALS && count / recognized < LOW_SHARE[nutrient] };
  });
  return { planned: inWeek.length, recognized, rows };
}

const LOW_TEXT: Record<Nutrient, string> = {
  protein: "poche proteine",
  carbs: "pochi carboidrati",
  fat: "pochi grassi",
  fiber: "poche fibre",
};

/** "a, b e c". */
export function listText(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Una frase sul bilancio della settimana. */
export function balanceNote(balance: Balance): string {
  if (balance.planned === 0) return "Nessun pasto in programma.";
  if (balance.recognized < MIN_MEALS) return "Ancora pochi pasti per dire com'è distribuita.";
  const low = balance.rows.filter((r) => r.low).map((r) => LOW_TEXT[r.nutrient]);
  if (low.length === 0) return "Settimana ben distribuita.";
  const text = `${listText(low)} nella settimana.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
