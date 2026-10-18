import { addDays, relativeDay, type LocalDate } from "../dates/local";
import type { LaundryLoad, Outfit, OutfitPlan, Task, WardrobeCategory, WardrobeItem, WashGroup } from "../supabase/types";
import type { DayForecast } from "../weather/forecast";
import { CATEGORY_LABEL } from "./categories";
import { resolvePlan, upcomingPlans } from "./plans";

/**
 * Lavatrici collegate al guardaroba (D69). Regole locali e spiegabili, come le Idee:
 * ogni capo ha un gruppo di lavaggio (scelto a mano o ricavato da colori e materiale), e quando un gruppo
 * ha abbastanza capi da lavare, o un capo serve presto, l'app propone la lavatrice di quel gruppo.
 */

export const WASH_GROUPS: WashGroup[] = ["dark", "light", "colored", "delicate"];

export const WASH_GROUP_LABEL: Record<WashGroup, string> = { dark: "Scuri", light: "Chiari", colored: "Colorati", delicate: "Delicati" };

/** "Lavatrice degli scuri". */
export const WASH_GROUP_OF: Record<WashGroup, string> = { dark: "degli scuri", light: "dei chiari", colored: "dei colorati", delicate: "dei delicati" };

/** Titolo dell'attività creata dall'app. Lo riconosce anche `laundryGroupOfTask`. */
export function laundryTaskTitle(group: WashGroup | null): string {
  return group ? `Lavatrice ${WASH_GROUP_LABEL[group].toLowerCase()}` : "Lavatrice";
}

/** Scarpe e borse non vanno in lavatrice: restano fuori da conteggi e proposte. */
export function isWashable(item: Pick<WardrobeItem, "category">): boolean {
  return item.category !== "shoes" && item.category !== "bag";
}

const DARK = ["nero", "blu", "bordeaux", "marrone", "grigio", "verde"];
const COLORED = ["azzurro", "rosa", "lilla", "giallo", "arancione", "rosso"];
const LIGHT = ["bianco", "beige"];
const DELICATE = /\b(lana|seta|cashmere|cachemire|merino|angora|alpaca|mohair|pizzo|raso)\b/i;

/**
 * Il gruppo proposto dai dati del capo. Il materiale delicato vince sul colore; tra i colori vince il più
 * "rischioso": un capo bianco e nero va con gli scuri, uno bianco e rosso con i colorati.
 * Oro, argento e "altro" non dicono nulla. Senza indizi: nessun gruppo (si sceglie a mano).
 */
export function autoWashGroup(item: Pick<WardrobeItem, "colors" | "material" | "name" | "subcategory">): WashGroup | null {
  if ([item.material, item.name, item.subcategory].some((t) => t && DELICATE.test(t))) return "delicate";
  if (item.colors.some((c) => DARK.includes(c))) return "dark";
  if (item.colors.some((c) => COLORED.includes(c))) return "colored";
  if (item.colors.some((c) => LIGHT.includes(c))) return "light";
  return null;
}

/** Il gruppo di un capo: quello scelto a mano, altrimenti quello proposto. */
export function washGroupOf(item: Pick<WardrobeItem, "wash_group" | "colors" | "material" | "name" | "subcategory">): WashGroup | null {
  return item.wash_group ?? autoWashGroup(item);
}

const LAUNDRY_WORD = /lavatric|bucato|lavaggio/i;
const GROUP_WORDS: [RegExp, WashGroup][] = [
  [/scur|\bner[io]\b/i, "dark"],
  [/chiar|bianc/i, "light"],
  [/color/i, "colored"],
  [/delicat|\blana\b|a mano/i, "delicate"],
];

/**
 * Se un'attività è una lavatrice, e di quale gruppo. `undefined`: non è una lavatrice; `null`: lo è, senza gruppo.
 * Vale per quelle create dall'app e per quelle scritte a mano ("Lavatrice scuri", "bucato bianchi").
 */
export function laundryGroupOfTask(task: Pick<Task, "source" | "laundry_group" | "title">): WashGroup | null | undefined {
  if (task.source === "laundry") return task.laundry_group;
  if (!LAUNDRY_WORD.test(task.title)) return undefined;
  return GROUP_WORDS.find(([re]) => re.test(task.title))?.[1] ?? null;
}

/** Capi per un carico, finché lo storico non dice altro. */
export const DEFAULT_LOAD: Record<WashGroup, number> = { dark: 6, light: 6, colored: 6, delicate: 4 };
const MIN_LOAD = 3;
const MAX_LOAD = 15;

/** Quanti capi fanno un carico: la mediana delle ultime cinque lavatrici del gruppo, da due in su. */
export function loadSize(group: WashGroup, loads: Pick<LaundryLoad, "wash_group" | "washed_on" | "item_ids">[]): number {
  const counts = loads
    .filter((l) => l.wash_group === group && l.item_ids.length > 0)
    .sort((a, b) => b.washed_on.localeCompare(a.washed_on))
    .slice(0, 5)
    .map((l) => l.item_ids.length)
    .sort((a, b) => a - b);
  if (counts.length < 2) return DEFAULT_LOAD[group];
  const mid = Math.floor(counts.length / 2);
  const median = counts.length % 2 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
  return Math.min(MAX_LOAD, Math.max(MIN_LOAD, median));
}

/** Un outfit in programma entro questi giorni rende urgente la lavatrice dei suoi capi da lavare. */
export const PLAN_HORIZON = 4;

/** Scorte: sotto questa soglia di capi puliti la lavatrice diventa utile, se la categoria ne ha almeno `STOCK_MIN_TOTAL`. */
const STOCK_LOW = 2;
const STOCK_MIN_TOTAL = 4;
const STOCK_NOUN: Partial<Record<WardrobeCategory, [one: string, many: string]>> = {
  top: ["top", "top"],
  bottom: ["pantalone o gonna", "pantaloni o gonne"],
  dress: ["vestito", "vestiti"],
};

function stockText(category: WardrobeCategory, left: number): string {
  const [one, many] = STOCK_NOUN[category]!;
  if (left === 0) return `Nessun ${one} pulito`;
  if (left === 1) return `Resta 1 ${one} pulito`;
  return `Restano ${left} ${many} puliti`;
}

export function itemLabel(item: Pick<WardrobeItem, "name" | "category">): string {
  return item.name ?? CATEGORY_LABEL[item.category];
}

export type LaundryNeed = { date: LocalDate; item: WardrobeItem };

export type LaundryProposal = {
  group: WashGroup;
  /** I capi da lavare del gruppo. */
  items: WardrobeItem[];
  /** Frasi brevi, la più importante per prima. */
  reasons: string[];
  /** Entro quando farla perché un capo in programma sia pulito; vuoto se non c'è fretta. */
  deadline: LocalDate | null;
  urgent: boolean;
};

export type LaundryOverview = {
  /** Capi da lavare per gruppo, solo i gruppi che ne hanno. */
  counts: { group: WashGroup; count: number }[];
  /** Capi da lavare senza gruppo: né scelto né ricavabile. */
  ungrouped: WardrobeItem[];
  proposals: LaundryProposal[];
};

/** Da lavare, raggruppato, con le proposte di lavatrice. */
export function laundryOverview(input: {
  items: WardrobeItem[];
  plans: OutfitPlan[];
  outfits: Outfit[];
  loads: LaundryLoad[];
  today: LocalDate;
}): LaundryOverview {
  const { items, today } = input;
  const washable = items.filter((i) => !i.deleted_at && isWashable(i));
  const dirty = washable.filter((i) => i.status === "to_wash");
  const byGroup = new Map<WashGroup, WardrobeItem[]>();
  const ungrouped: WardrobeItem[] = [];
  for (const item of dirty) {
    const group = washGroupOf(item);
    if (!group) ungrouped.push(item);
    else byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }

  // Capi da lavare che servono per un outfit dei prossimi giorni.
  const needs: LaundryNeed[] = [];
  const horizon = addDays(today, PLAN_HORIZON);
  for (const plan of upcomingPlans(input.plans, today)) {
    if (plan.date > horizon) break;
    for (const item of resolvePlan(plan, input.outfits, items).items) {
      if (item.status === "to_wash" && isWashable(item) && !needs.some((n) => n.item.id === item.id)) needs.push({ date: plan.date, item });
    }
  }

  const proposals: LaundryProposal[] = [];
  for (const group of WASH_GROUPS) {
    const groupItems = byGroup.get(group);
    if (!groupItems) continue;
    const reasons: string[] = [];

    const groupNeeds = needs.filter((n) => washGroupOf(n.item) === group);
    let deadline: LocalDate | null = null;
    if (groupNeeds.length > 0) {
      const first = groupNeeds[0];
      deadline = first.date === today ? today : addDays(first.date, -1);
      const names = groupNeeds.filter((n) => n.date === first.date).map((n) => itemLabel(n.item));
      reasons.push(`Serve ${relativeDay(first.date, today)}: ${names.join(", ")}`);
    }

    for (const category of Object.keys(STOCK_NOUN) as WardrobeCategory[]) {
      const all = washable.filter((i) => i.category === category);
      if (all.length < STOCK_MIN_TOTAL || !groupItems.some((i) => i.category === category)) continue;
      const left = all.filter((i) => i.status !== "to_wash").length;
      if (left <= STOCK_LOW) reasons.push(stockText(category, left));
    }

    const size = loadSize(group, input.loads);
    if (groupItems.length >= size) reasons.push(`${groupItems.length} capi: un carico pieno`);

    if (reasons.length > 0) proposals.push({ group, items: groupItems, reasons, deadline, urgent: deadline !== null });
  }

  proposals.sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline || b.deadline) return a.deadline ? -1 : 1;
    return b.items.length - a.items.length;
  });

  return {
    counts: WASH_GROUPS.filter((g) => byGroup.has(g)).map((group) => ({ group, count: byGroup.get(group)!.length })),
    ungrouped,
    proposals,
  };
}

/**
 * "Non ora": la proposta torna quando il gruppo ha più capi di quando è stata messa da parte.
 * Una proposta urgente (un capo in programma) non si nasconde.
 */
export function isSnoozed(proposal: Pick<LaundryProposal, "group" | "items" | "urgent">, snoozed: Partial<Record<WashGroup, number>>): boolean {
  const at = snoozed[proposal.group];
  return !proposal.urgent && at !== undefined && proposal.items.length <= at;
}

/** La prossima lavatrice da fare di un gruppo tra le attività aperte, dalla più vicina. */
export function plannedLaundry(tasks: Task[], group: WashGroup): Task | null {
  const open = tasks.filter((t) => t.status === "open" && !t.deleted_at && laundryGroupOfTask(t) === group);
  const day = (t: Task) => t.date ?? t.due_date ?? "9999-12-31";
  return open.sort((a, b) => day(a).localeCompare(day(b)))[0] ?? null;
}

const RAIN_LIKELY = 50;

/** Una nota per stendere, dalla previsione di oggi e domani. Senza previsione, niente. */
export function dryingNote(days: DayForecast[] | null, today: LocalDate): string | null {
  if (!days) return null;
  const rain = (date: LocalDate) => days.find((d) => d.date === date)?.rain ?? null;
  const now = rain(today);
  const next = rain(addDays(today, 1));
  if (now !== null && now >= RAIN_LIKELY) return "Oggi pioggia probabile: se stendi fuori, meglio un altro giorno";
  if (next !== null && next >= RAIN_LIKELY && now !== null) return "Domani pioggia probabile: per stendere, meglio oggi";
  return null;
}

/**
 * I capi da proporre quando una lavatrice è fatta. `selected`: i capi da lavare del gruppo, già scelti.
 * `optional`: quelli indossati (riutilizzabili) dello stesso gruppo, da aggiungere se ci sono finiti dentro.
 * Senza gruppo si vedono tutti i capi da lavare, nessuno già scelto.
 */
export function loadCandidates(items: WardrobeItem[], group: WashGroup | null): { selected: WardrobeItem[]; optional: WardrobeItem[] } {
  const washable = items.filter((i) => !i.deleted_at && isWashable(i));
  if (!group) return { selected: [], optional: washable.filter((i) => i.status === "to_wash") };
  const inGroup = washable.filter((i) => washGroupOf(i) === group);
  return { selected: inGroup.filter((i) => i.status === "to_wash"), optional: inGroup.filter((i) => i.status === "worn") };
}
