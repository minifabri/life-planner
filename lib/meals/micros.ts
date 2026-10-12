import type { MealPlan, Nutrient } from "../supabase/types";
import { foodIndex } from "./food-index";
import { NUTRIENTS, NUTRIENT_LABEL, listText, nutrientsOf, type Overrides } from "./nutrients";

/**
 * Micronutrienti dei pasti, riconosciuti dal nome del piatto come i nutrienti (`nutrients.ts`).
 * Dice quali alimenti del piatto ne sono una buona fonte, non quanti milligrammi: è un'indicazione
 * per vedere cosa torna spesso e cosa non compare mai, non un conteggio.
 */

export type Micro = "iron" | "calcium" | "zinc" | "omega3" | "vitA" | "vitC" | "folate";

export const MICROS: Micro[] = ["iron", "calcium", "zinc", "omega3", "vitA", "vitC", "folate"];

export const MICRO_LABEL: Record<Micro, string> = {
  iron: "Ferro",
  calcium: "Calcio",
  zinc: "Zinco",
  omega3: "Omega-3",
  vitA: "Vitamina A",
  vitC: "Vitamina C",
  folate: "Folati",
};

/** Le buone fonti di ogni micronutriente. Come si scrivono le voci: `foodIndex`. */
const SOURCES: Record<Micro, string> = {
  iron: "lenticchie, ceci, fagioli, piselli, fave, lupini, legumi, edamame, tofu, tempeh, =soia, hummus, falafel, spinaci, bietola, cime rapa, quinoa, avena, porridge, muesli, farro, grano saraceno, integrale, integrali, anacardi, pistacchi, semi zucca, tahina, sesamo, semi sesamo, cioccolato, cioccolata, manzo, bistecca, carne, tagliata, vitello, bresaola, hamburger, ragu, cozze, vongole",
  calcium: "latte, yogurt, skyr, kefir, formaggio, mozzarella, ricotta, parmigiano, =grana, pecorino, feta, burrata, stracchino, scamorza, caprino, gorgonzola, fiocchi latte, besciamella, pizza, lasagne, gelato, tofu, edamame, mandorle, tahina, sesamo, semi sesamo, cavolo, broccoli, cime rapa, rucola, fichi, sardine, alici, acciughe",
  zinc: "lenticchie, ceci, fagioli, legumi, hummus, falafel, tofu, tempeh, edamame, quinoa, avena, porridge, muesli, granola, farro, grano saraceno, integrale, integrali, semi, semi zucca, semi sesamo, semi canapa, canapa, anacardi, noci, mandorle, arachidi, pinoli, frutta secca, tahina, sesamo, cioccolato, cioccolata, manzo, bistecca, carne, tagliata, vitello, hamburger, ragu, formaggio, parmigiano, uovo, frittata, omelette, cozze",
  omega3: "noci, semi lino, =lino, semi chia, =chia, semi canapa, canapa, salmone, sgombro, sardine, alici, acciughe, tonno",
  vitA: "carota, zucca, patata dolce, batata, spinaci, bietola, cavolo, cime rapa, broccoli, rucola, lattuga, cicoria, radicchio, peperone, pomodoro, pomodorini, melone, albicocca, mango, uovo, frittata, omelette",
  vitC: "peperone, broccoli, cavolfiore, cavolo, cavoletti, verza, cime rapa, rucola, spinaci, pomodoro, pomodorini, finocchio, patata, patata dolce, kiwi, arancia, mandarino, clementine, limone, pompelmo, agrumi, spremuta, fragola, mirtilli, lamponi, frutti bosco, ananas, melone, mango, frutta, macedonia, verdura, insalata, crudites, minestrone",
  folate: "lenticchie, ceci, fagioli, piselli, fave, legumi, edamame, hummus, falafel, spinaci, bietola, cime rapa, asparagi, broccoli, cavoletti, cavolfiore, cavolo, lattuga, insalata, rucola, cicoria, radicchio, carciofo, barbabietola, avocado, guacamole, arancia, arachidi, quinoa, verdura, minestrone, uovo, frittata, omelette",
};

const findMicros = foodIndex(MICROS.map((m): [Micro[], string] => [[m], SOURCES[m]]));

/** I micronutrienti di cui il piatto ha una buona fonte, sempre nello stesso ordine. Vuoto se il nome non dice nulla. */
export function recognizeMicros(name: string): Micro[] {
  const found = findMicros(name);
  return MICROS.filter((m) => found.has(m));
}

export type DayRow<T> = {
  key: T;
  label: string;
  /** In quanti pasti del giorno compare. */
  meals: number;
};

export type DaySummary = {
  planned: number;
  /** I pasti di cui il nome (o la correzione a mano) dice qualcosa: le barre si misurano su questi. */
  recognized: number;
  nutrients: DayRow<Nutrient>[];
  micros: DayRow<Micro>[];
};

/** Nutrienti e micronutrienti nei pasti di un giorno: per ciascuno, in quanti pasti compare. Gli extra contano come un pasto; un pasto fuori senza nome non conta. */
export function daySummary(meals: MealPlan[], overrides?: Overrides): DaySummary {
  const known = meals.filter((m) => m.name).map((m) => ({ nutrients: nutrientsOf(m.name, overrides), micros: recognizeMicros(m.name) }));
  return {
    planned: known.length,
    recognized: known.filter((m) => m.nutrients.length > 0 || m.micros.length > 0).length,
    nutrients: NUTRIENTS.map((key) => ({ key, label: NUTRIENT_LABEL[key], meals: known.filter((m) => m.nutrients.includes(key)).length })),
    micros: MICROS.map((key) => ({ key, label: MICRO_LABEL[key], meals: known.filter((m) => m.micros.includes(key)).length })),
  };
}

/** L'etichetta dentro una frase: "ferro", "vitamina C". */
function inText(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Una frase su ciò che c'è e ciò che manca tra le righe date: nomina il gruppo più corto. `null` se non c'è nulla. */
export function rowsNote(rows: DayRow<unknown>[]): string | null {
  const present = rows.filter((r) => r.meals > 0).map((r) => inText(r.label));
  const missing = rows.filter((r) => r.meals === 0).map((r) => inText(r.label));
  if (present.length === 0) return null;
  if (missing.length === 0) return "ci sono tutti";
  return missing.length <= present.length ? `${missing.length === 1 ? "manca" : "mancano"} ${listText(missing)}` : `solo ${listText(present)}`;
}
