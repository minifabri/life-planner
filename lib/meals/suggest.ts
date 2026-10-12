import { addDays, diffDays, type LocalDate } from "../dates/local";
import type { DaySign } from "../days/marks";
import type { MealMemory, MealPlan, MealSlot, Nutrient, PrepMode } from "../supabase/types";
import { DISHES } from "./dishes";
import { ingredientsIn } from "./ingredients";
import { NUTRIENTS, NUTRIENT_LABEL, listText, nutrientsOf, weekBalance, type Overrides } from "./nutrients";
import { normalizeMealName } from "./rules";

/**
 * Idee per i pasti: regole locali, deterministiche e spiegabili, senza servizi esterni.
 * Propone i piatti già usati in quel momento della giornata e alcuni piatti nuovi (`DISHES`),
 * ordinati da ciò che manca nella settimana e nel giorno, dagli ingredienti in casa da usare,
 * dalla varietà rispetto ai giorni vicini, dall'abitudine e dal tipo di giorno.
 */

export type Factor = "balance" | "pantry" | "variety" | "habit" | "day";

export const WEIGHTS: Record<Factor, number> = { balance: 3, pantry: 2, variety: 2, habit: 2, day: 1 };

export type IdeaData = {
  memory: MealMemory[];
  /** I pasti noti intorno al giorno: la sua settimana e, se ci sono, quelle vicine. */
  meals: MealPlan[];
  /** Gli ingredienti in casa non ancora usati in un pasto. */
  pantry: { name: string }[];
  overrides?: Overrides;
};

export type IdeaContext = {
  day: LocalDate;
  slot: MealSlot;
  /** Il lunedì della settimana del giorno. */
  weekFrom: LocalDate;
  signs: DaySign[];
};

export type Idea = {
  /** Nome normalizzato: identifica la proposta. */
  key: string;
  name: string;
  slot: MealSlot;
  mode: PrepMode;
  /** Un piatto mai usato in questo momento della giornata. */
  isNew: boolean;
  nutrients: Nutrient[];
  /** Perché è qui, in una frase. */
  reason: string;
  score: number;
};

type Candidate = { key: string; name: string; mode: PrepMode; uses: number };

function labels(nutrients: Nutrient[]): string {
  return listText(nutrients.map((n) => NUTRIENT_LABEL[n].toLowerCase()));
}

/** Più è vicino l'ultimo giorno con lo stesso piatto, più basso è il voto. */
function varietyScore(gap: number | undefined): number {
  if (gap === undefined) return 1;
  if (gap === 0) return 0;
  if (gap <= 1) return 0.1;
  if (gap <= 3) return 0.4;
  if (gap <= 6) return 0.7;
  return 1;
}

/** Le idee per un momento di un giorno, dalla più adatta. Due piatti abituali ogni piatto nuovo, finché ce ne sono. */
export function suggestMeals(data: IdeaData, ctx: IdeaContext, limit = 9): Idea[] {
  const { memory, meals, pantry, overrides } = data;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.weekFrom, i));
  const others = meals.filter((m) => !(m.date === ctx.day && m.slot === ctx.slot));

  const low = weekBalance(others, days, overrides).rows.filter((r) => r.low).map((r) => r.nutrient);
  const sameDay = others.filter((m) => m.date === ctx.day);
  const dayHas = new Set(sameDay.flatMap((m) => nutrientsOf(m.name, overrides)));
  // Senza altri pasti nel giorno non c'è niente da completare.
  const dayMissing = sameDay.length === 0 ? [] : NUTRIENTS.filter((n) => !dayHas.has(n));
  const planned = new Set(sameDay.map((m) => normalizeMealName(m.name)));

  const inSlot = memory.filter((m) => m.slot === ctx.slot);
  const hidden = new Set(inSlot.filter((m) => m.hidden_at).map((m) => m.name_normalized));
  const own: Candidate[] = inSlot
    .filter((m) => m.use_count > 0)
    .map((m) => ({ key: m.name_normalized, name: m.display_name, mode: m.default_prep_mode, uses: m.use_count }));
  const known = new Set(own.map((c) => c.key));
  const fresh: Candidate[] = DISHES.filter((d) => d.slots.includes(ctx.slot))
    .map((d) => ({ key: normalizeMealName(d.name), name: d.name, mode: d.mode, uses: 0 }))
    .filter((c) => !known.has(c.key));

  const workout = ctx.signs.includes("workout");
  const office = ctx.signs.includes("office") && ctx.slot === "lunch";
  const wanted = (n: Nutrient) => (low.includes(n) ? 2 : 0) + (dayMissing.includes(n) ? 1 : 0);
  const most = NUTRIENTS.reduce((sum, n) => sum + wanted(n), 0);

  function idea(c: Candidate): Idea {
    const nutrients = nutrientsOf(c.name, overrides);
    const inHouse = ingredientsIn(c.name, pantry);
    const gaps = others.filter((m) => normalizeMealName(m.name) === c.key).map((m) => Math.abs(diffDays(m.date, ctx.day)));
    const protein = nutrients.includes("protein");

    const factors: Record<Factor, number> = {
      balance: most === 0 ? 0.5 : nutrients.reduce((sum, n) => sum + wanted(n), 0) / most,
      pantry: pantry.length === 0 ? 0.5 : inHouse.length > 0 ? 1 : 0.3,
      variety: varietyScore(gaps.length ? Math.min(...gaps) : undefined),
      habit: c.uses > 0 ? 0.6 + 0.4 * Math.min(1, c.uses / 5) : 0.4,
      day: workout ? (protein ? 1 : 0.3) : office ? (c.mode === "to_prep" ? 1 : 0.4) : 0.5,
    };
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    const score = (Object.keys(WEIGHTS) as Factor[]).reduce((sum, f) => sum + factors[f] * WEIGHTS[f], 0) / total;

    const bringsLow = nutrients.filter((n) => low.includes(n));
    const completes = nutrients.filter((n) => dayMissing.includes(n) && !low.includes(n));
    const why = [
      inHouse.length > 0 ? `Usa ${listText(inHouse.map((i) => i.name.toLowerCase()))}, che hai in casa` : null,
      bringsLow.length > 0 ? `Porta ${labels(bringsLow)}, che scarseggiano nella settimana` : null,
      completes.length > 0 ? `Completa il giorno con ${labels(completes)}` : null,
      workout && protein && !bringsLow.includes("protein") && !completes.includes("protein") ? "Proteine nel giorno di allenamento" : null,
      office && c.mode === "to_prep" ? "Si prepara prima, per il giorno in ufficio" : null,
      c.uses >= 3 ? `Lo fai spesso: ${c.uses} volte` : null,
      c.uses === 0 ? "Un piatto nuovo" : null,
    ].filter((part): part is string => part !== null);

    return {
      key: c.key,
      name: c.name,
      slot: ctx.slot,
      mode: c.mode,
      isNew: c.uses === 0,
      nutrients,
      reason: `${(why.length > 0 ? why.slice(0, 2) : ["Tra i tuoi piatti abituali"]).join(". ")}.`,
      score,
    };
  }

  const rank = (candidates: Candidate[]) =>
    candidates
      .filter((c) => !hidden.has(c.key) && !planned.has(c.key))
      .map(idea)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "it"));

  const usual = rank(own);
  const novel = rank(fresh);
  const ideas: Idea[] = [];
  while (ideas.length < limit && (usual.length > 0 || novel.length > 0)) {
    // Ogni terza proposta è un piatto nuovo; se un elenco finisce, si continua con l'altro.
    const next = (ideas.length % 3 === 2 ? novel.shift() ?? usual.shift() : usual.shift() ?? novel.shift()) as Idea;
    ideas.push(next);
  }
  return ideas;
}
