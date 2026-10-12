import { diffDays, type LocalDate } from "../dates/local";
import type { Outfit, OutfitFeedback, WardrobeCategory, WardrobeItem, WardrobeStyle, WardrobeWear } from "../supabase/types";
import { orderForBoard } from "./outfits";

/**
 * Motore dei suggerimenti: regole locali, deterministiche e spiegabili. Nessun servizio esterno.
 * Ogni combinazione riceve un voto da 0 a 1 per ciascun fattore; il totale è la media pesata.
 * Un fattore senza dati (capi senza colori, senza pesantezza…) vale 0.5 e non entra nella motivazione.
 */

export type Factor = "color" | "style" | "occasion" | "thermal" | "availability" | "preference" | "feedback" | "variety";
export type Weights = Record<Factor, number>;

export const DEFAULT_WEIGHTS: Weights = {
  color: 1.5,
  style: 1.5,
  occasion: 1.5,
  thermal: 1.5,
  availability: 2,
  preference: 1.5,
  feedback: 1,
  variety: 1,
};

/** Profilo di partenza: un orientamento, non un elenco di divieti. Si modifica da "Il mio stile". */
export const DEFAULT_STYLE: WardrobeStyle = {
  liked_styles: ["minimal", "urban", "gothic", "elegante", "cyber"],
  liked_colors: ["nero", "bianco", "grigio", "lilla", "oro"],
  avoid: ["blazer", "mocassin", "con lacci", "fantasia", "scritte", "asimmetric"],
  weights: null,
};

export type Band = "cold" | "mild" | "warm";
export type Season = "winter" | "spring" | "summer" | "autumn";

export type SuggestContext = {
  today: LocalDate;
  occasion: string | null;
  /** Temperatura indicata a mano; `null` = non nota, si usa la stagione e lo si dichiara. */
  band: Band | null;
};

export type SuggestData = {
  items: WardrobeItem[];
  outfits: Outfit[];
  wears: WardrobeWear[];
  feedback: OutfitFeedback[];
  style: WardrobeStyle;
};

export type Suggestion = {
  /** Etichetta della proposta ("Consigliato", "Elegante", "Alternativo"), quando ha senso. */
  label: string | null;
  items: WardrobeItem[];
  itemIds: string[];
  signature: string;
  score: number;
  factors: Weights;
  /** Motivazione sintetica, fatta solo di ciò che i dati permettono di affermare. */
  reason: string;
  /** Avvertenze: meteo non considerato, capi da lavare. */
  notes: string[];
};

/** Colori che stanno con tutto: non contano come accento. */
export const NEUTRALS = ["nero", "bianco", "grigio", "beige", "oro", "argento"];
const POOL_SIZE = 6;
const SIDE_POOL_SIZE = 4;
const RECENT_DAYS = 14;
const TARGET_WARMTH: Record<Band, number> = { cold: 4.2, mild: 2.8, warm: 1.6 };
const OUTERWEAR_BONUS = 1.2;

/** Identità di una combinazione, indipendente dall'ordine dei capi. */
export function signatureOf(itemIds: string[]): string {
  return [...new Set(itemIds)].sort().join("|");
}

export function seasonOf(date: LocalDate): Season {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

const SEASON_BAND: Record<Season, Band> = { winter: "cold", spring: "mild", summer: "warm", autumn: "mild" };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pairsOf(ids: string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(pairKey(ids[i], ids[j]));
  return pairs;
}

/** Tutto ciò che si ricava una volta sola da storico, feedback e profilo. */
type Prepared = {
  ctx: SuggestContext;
  band: Band;
  season: Season;
  style: WardrobeStyle;
  weights: Weights;
  lastWorn: Map<string, LocalDate>;
  wornPairs: Set<string>;
  recentSignatures: Set<string>;
  knownSignatures: Set<string>;
  disliked: Set<string>;
  pairFeedback: Map<string, number>;
};

function prepare(data: SuggestData, ctx: SuggestContext): Prepared {
  const season = seasonOf(ctx.today);
  const lastWorn = new Map<string, LocalDate>();
  const wornPairs = new Set<string>();
  const recentSignatures = new Set<string>();
  const knownSignatures = new Set<string>(data.outfits.filter((o) => !o.deleted_at).map((o) => signatureOf(o.item_ids)));
  for (const wear of data.wears) {
    for (const id of wear.item_ids) {
      const previous = lastWorn.get(id);
      if (!previous || wear.worn_on > previous) lastWorn.set(id, wear.worn_on);
    }
    for (const pair of pairsOf(wear.item_ids)) wornPairs.add(pair);
    const signature = signatureOf(wear.item_ids);
    knownSignatures.add(signature);
    if (diffDays(ctx.today, wear.worn_on) < RECENT_DAYS) recentSignatures.add(signature);
  }
  const disliked = new Set<string>();
  const pairFeedback = new Map<string, number>();
  for (const entry of data.feedback) {
    const delta = entry.verdict === "like" ? 1 : -1;
    if (entry.verdict === "dislike") disliked.add(entry.signature);
    for (const pair of pairsOf(entry.item_ids)) pairFeedback.set(pair, (pairFeedback.get(pair) ?? 0) + delta);
  }
  return {
    ctx,
    band: ctx.band ?? SEASON_BAND[season],
    season,
    style: data.style,
    weights: { ...DEFAULT_WEIGHTS, ...(data.style.weights ?? {}) },
    lastWorn,
    wornPairs,
    recentSignatures,
    knownSignatures,
    disliked,
    pairFeedback,
  };
}

type Scored = { score: number; known: boolean };
const UNKNOWN: Scored = { score: 0.5, known: false };

/** Quota dei capi (tra quelli che dichiarano qualcosa) che condividono il valore più diffuso. */
function coherence(lists: string[][]): Scored {
  const declared = lists.filter((l) => l.length > 0);
  if (declared.length === 0) return UNKNOWN;
  const count = new Map<string, number>();
  for (const list of declared) for (const value of new Set(list)) count.set(value, (count.get(value) ?? 0) + 1);
  return { score: Math.max(...count.values()) / declared.length, known: true };
}

function colorScore(items: WardrobeItem[]): Scored {
  const declared = items.filter((i) => i.colors.length > 0);
  if (declared.length === 0) return UNKNOWN;
  const accents = new Set(declared.flatMap((i) => i.colors).filter((c) => !NEUTRALS.includes(c)));
  return { score: accents.size <= 1 ? 1 : accents.size === 2 ? 0.6 : 0.3, known: true };
}

function occasionScore(items: WardrobeItem[], occasion: string | null): Scored {
  if (!occasion) return coherence(items.map((i) => i.occasions));
  const declared = items.filter((i) => i.occasions.length > 0);
  if (declared.length === 0) return UNKNOWN;
  return { score: declared.filter((i) => i.occasions.includes(occasion)).length / declared.length, known: true };
}

const CORE: WardrobeCategory[] = ["top", "bottom", "dress"];

function thermalScore(items: WardrobeItem[], p: Prepared): Scored {
  const core = items.filter((i) => CORE.includes(i.category) && i.warmth !== null);
  // Le stagioni sono un'indicazione: un capo "fuori stagione" abbassa il voto, non viene escluso.
  const inSeason = items.filter((i) => i.seasons.length === 0 || i.seasons.includes(p.season)).length / items.length;
  if (core.length === 0) return { score: 0.5 * 0.75 + inSeason * 0.25, known: false };
  const warmth = core.reduce((sum, i) => sum + (i.warmth ?? 0), 0) / core.length + (items.some((i) => i.category === "outerwear") ? OUTERWEAR_BONUS : 0);
  const fit = clamp01(1 - Math.abs(warmth - TARGET_WARMTH[p.band]) / 2.5);
  return { score: fit * 0.75 + inSeason * 0.25, known: true };
}

function itemText(item: WardrobeItem): string {
  return [item.name, item.subcategory, item.material, item.notes].filter(Boolean).join(" ").toLowerCase();
}

function likes(values: string[], liked: string[]): number {
  if (values.length === 0 || liked.length === 0) return 0.5;
  return values.some((v) => liked.includes(v)) ? 1 : 0.3;
}

function itemPreference(item: WardrobeItem, style: WardrobeStyle): number {
  const text = itemText(item);
  if (style.avoid.some((word) => word.trim() && text.includes(word.trim().toLowerCase()))) return 0;
  return clamp01((likes(item.styles, style.liked_styles) + likes(item.colors, style.liked_colors)) / 2 + (item.favorite ? 0.1 : 0));
}

function preferenceScore(items: WardrobeItem[], style: WardrobeStyle): Scored {
  const known = items.some((i) => i.styles.length > 0 || i.colors.length > 0 || itemPreference(i, style) === 0);
  return { score: items.reduce((sum, i) => sum + itemPreference(i, style), 0) / items.length, known };
}

function feedbackScore(ids: string[], p: Prepared): Scored {
  const known = pairsOf(ids)
    .map((pair) => p.pairFeedback.get(pair))
    .filter((v): v is number => v !== undefined);
  if (known.length === 0) return UNKNOWN;
  const mean = known.reduce((sum, v) => sum + Math.max(-2, Math.min(2, v)) / 2, 0) / known.length;
  return { score: 0.5 + 0.5 * mean, known: true };
}

function itemFreshness(id: string, p: Prepared): number {
  const last = p.lastWorn.get(id);
  return last ? clamp01(diffDays(p.ctx.today, last) / RECENT_DAYS) : 1;
}

function varietyScore(ids: string[], signature: string, p: Prepared): Scored {
  const fresh = ids.reduce((sum, id) => sum + itemFreshness(id, p), 0) / ids.length;
  return { score: p.recentSignatures.has(signature) ? fresh * 0.3 : fresh, known: true };
}

/** Quota delle coppie di capi mai indossate insieme: quanto la combinazione è nuova. */
function novelty(ids: string[], p: Prepared): number {
  const pairs = pairsOf(ids);
  return pairs.length === 0 ? 1 : pairs.filter((pair) => !p.wornPairs.has(pair)).length / pairs.length;
}

type Combo = { items: WardrobeItem[]; ids: string[]; signature: string; score: number; factors: Weights; known: Record<Factor, boolean> };

function evaluate(items: WardrobeItem[], p: Prepared): Combo {
  const ids = items.map((i) => i.id);
  const signature = signatureOf(ids);
  const scored: Record<Factor, Scored> = {
    color: colorScore(items),
    style: coherence(items.map((i) => i.styles)),
    occasion: occasionScore(items, p.ctx.occasion),
    thermal: thermalScore(items, p),
    availability: { score: items.filter((i) => i.status !== "to_wash").length / items.length, known: true },
    preference: preferenceScore(items, p.style),
    feedback: feedbackScore(ids, p),
    variety: varietyScore(ids, signature, p),
  };
  const factors = {} as Weights;
  const known = {} as Record<Factor, boolean>;
  let total = 0;
  let weight = 0;
  for (const factor of Object.keys(scored) as Factor[]) {
    factors[factor] = scored[factor].score;
    known[factor] = scored[factor].known;
    total += scored[factor].score * p.weights[factor];
    weight += p.weights[factor];
  }
  return { items, ids, signature, score: weight > 0 ? total / weight : 0, factors, known };
}

/** I capi più adatti di una categoria, valutati da soli: è il filtro che evita di provare tutte le combinazioni. */
function pool(items: WardrobeItem[], categories: WardrobeCategory[], size: number, p: Prepared, exclude?: string): WardrobeItem[] {
  return items
    .filter((i) => categories.includes(i.category) && i.id !== exclude)
    .map((item) => ({ item, score: evaluate([item], p).score }))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, size)
    .map((e) => e.item);
}

function best(candidates: Combo[]): Combo | null {
  return candidates.reduce<Combo | null>((top, c) => (!top || c.score > top.score ? c : top), null);
}

/** Tutte le combinazioni sensate (al più qualche decina), con un eventuale capo obbligatorio. */
function generate(data: SuggestData, p: Prepared, anchor: WardrobeItem | null): Combo[] {
  const items = data.items.filter((i) => !i.deleted_at);
  const fixed = (categories: WardrobeCategory[], size: number) =>
    anchor && categories.includes(anchor.category) ? [anchor] : pool(items, categories, size, p, anchor?.id);
  const tops = fixed(["top"], POOL_SIZE);
  const bottoms = fixed(["bottom"], POOL_SIZE);
  const dresses = fixed(["dress"], POOL_SIZE);
  const shoes = fixed(["shoes"], SIDE_POOL_SIZE);
  const outerwear = fixed(["outerwear"], SIDE_POOL_SIZE);
  const extras = fixed(["accessory", "bag"], SIDE_POOL_SIZE);

  const bases: WardrobeItem[][] = [];
  if (anchor?.category !== "dress") for (const top of tops) for (const bottom of bottoms) bases.push([top, bottom]);
  if (anchor?.category !== "top" && anchor?.category !== "bottom") for (const dress of dresses) bases.push([dress]);

  const combos: Combo[] = [];
  for (const base of bases) {
    let current = evaluate(anchor?.category === "other" ? [...base, anchor] : base, p);
    const extend = (options: WardrobeItem[], required: boolean) => {
      const candidate = best(options.map((o) => evaluate([...current.items, o], p)));
      if (candidate && (required || candidate.score >= current.score - 0.02)) current = candidate;
    };
    extend(shoes, true);
    // Il capospalla entra col freddo, o con il mite se la base è leggera; se è il capo scelto, entra sempre.
    const coreWarmth = base.filter((i) => i.warmth !== null).map((i) => i.warmth as number);
    const light = coreWarmth.length > 0 && coreWarmth.reduce((a, b) => a + b, 0) / coreWarmth.length < 2.5;
    if (anchor?.category === "outerwear" || p.band === "cold" || (p.band === "mild" && light)) extend(outerwear, true);
    extend(extras, anchor?.category === "accessory" || anchor?.category === "bag");
    if (!p.disliked.has(current.signature)) combos.push(current);
  }
  return combos;
}

function joinReasons(parts: string[]): string {
  if (parts.length === 0) return "";
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const BAND_REASON: Record<Band, string> = { cold: "adatto al freddo", mild: "adatto a una giornata mite", warm: "adatto al caldo" };

function describe(combo: Combo, p: Prepared, label: string | null, lead?: string): Suggestion {
  const { factors, known } = combo;
  // In ordine di quanto dicono a chi legge: prima il contesto richiesto, poi i gusti, poi il resto.
  const candidates: { text: string; ok: boolean }[] = [
    { text: `adatto a: ${p.ctx.occasion}`, ok: !!p.ctx.occasion && known.occasion && factors.occasion >= 0.7 },
    { text: p.ctx.band ? BAND_REASON[p.band] : "adatto alla stagione", ok: known.thermal && factors.thermal >= 0.7 },
    { text: "simile ad abbinamenti che ti sono piaciuti", ok: known.feedback && factors.feedback > 0.6 },
    { text: "coerente con il tuo stile", ok: known.preference && factors.preference >= 0.7 },
    { text: "colori in armonia", ok: known.color && factors.color >= 0.9 },
    { text: "composto da capi disponibili", ok: factors.availability === 1 },
  ];
  const reasons = candidates
    .filter((c) => c.ok)
    .slice(0, lead ? 2 : 3)
    .map((c) => c.text);
  const toWash = combo.items.filter((i) => i.status === "to_wash").length;
  const notes: string[] = [];
  if (!p.ctx.band) notes.push("Non considera il meteo.");
  if (toWash > 0) notes.push(toWash === 1 ? "Contiene un capo da lavare." : `Contiene ${toWash} capi da lavare.`);
  const items = orderForBoard(combo.items);
  return {
    label,
    items,
    itemIds: items.map((i) => i.id),
    signature: combo.signature,
    score: combo.score,
    factors,
    reason: joinReasons(lead ? [lead, ...reasons] : reasons),
    notes,
  };
}

/** Quanti capi di `a` non sono in `b`. */
function difference(a: Combo, b: Combo): number {
  return a.ids.filter((id) => !b.ids.includes(id)).length;
}

/** Sceglie dall'ordinamento le prime combinazioni davvero diverse tra loro (almeno due capi di differenza, se possibile). */
function pickDistinct(ranked: Combo[], count: number, chosen: Combo[] = []): Combo[] {
  const picked: Combo[] = [];
  for (const minDiff of [2, 1]) {
    for (const combo of ranked) {
      if (picked.length >= count) return picked;
      if ([...chosen, ...picked].every((other) => other.signature !== combo.signature && difference(combo, other) >= minDiff)) picked.push(combo);
    }
  }
  return picked;
}

function byScore(score: (c: Combo) => number) {
  return (a: Combo, b: Combo) => score(b) - score(a) || a.signature.localeCompare(b.signature);
}

/** Modalità A — proposte per il contesto dato, dalla più pertinente, diverse tra loro. */
export function suggestOutfits(data: SuggestData, ctx: SuggestContext, limit = 9): Suggestion[] {
  const p = prepare(data, ctx);
  const ranked = generate(data, p, null).sort(byScore((c) => c.score));
  return pickDistinct(ranked, limit).map((c) => describe(c, p, null));
}

function elegance(combo: Combo): number {
  const elegant = combo.items.filter((i) => i.styles.includes("elegante") || i.occasions.some((o) => o === "serata" || o === "cerimonia")).length / combo.items.length;
  return (combo.factors.color + combo.factors.style + elegant) / 3;
}

/**
 * Modalità B — tre proposte intorno a un capo: la più coerente con il contesto, la più curata nell'estetica,
 * e una meno abituale. Sono combinazioni diverse, non la stessa con un altro nome.
 */
export function suggestAround(data: SuggestData, ctx: SuggestContext, anchorId: string): Suggestion[] {
  const anchor = data.items.find((i) => i.id === anchorId && !i.deleted_at);
  if (!anchor) return [];
  const p = prepare(data, ctx);
  const combos = generate(data, p, anchor);
  const plans: { label: string; score: (c: Combo) => number }[] = [
    { label: "Consigliato", score: (c) => c.score },
    { label: "Elegante", score: (c) => 0.6 * elegance(c) + 0.4 * c.score },
    { label: "Alternativo", score: (c) => 0.6 * novelty(c.ids, p) + 0.4 * c.score },
  ];
  const chosen: Combo[] = [];
  const result: Suggestion[] = [];
  for (const plan of plans) {
    const [pick] = pickDistinct([...combos].sort(byScore(plan.score)), 1, chosen);
    if (!pick) continue;
    chosen.push(pick);
    result.push(describe(pick, p, plan.label));
  }
  return result;
}

const DISCOVER_CATEGORIES: WardrobeCategory[] = ["top", "bottom", "dress", "shoes", "outerwear"];

/** Modalità C — parte dai capi meno usati e propone abbinamenti mai indossati né salvati. */
export function suggestDiscover(data: SuggestData, ctx: SuggestContext, limit = 3): Suggestion[] {
  const p = prepare(data, ctx);
  const neglected = data.items
    .filter((i) => !i.deleted_at && i.status !== "to_wash" && DISCOVER_CATEGORIES.includes(i.category))
    .sort((a, b) => (p.lastWorn.get(a.id) ?? "").localeCompare(p.lastWorn.get(b.id) ?? "") || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const chosen: Combo[] = [];
  const result: Suggestion[] = [];
  for (const anchor of neglected) {
    if (result.length >= limit) break;
    if (chosen.some((c) => c.ids.includes(anchor.id))) continue;
    const fresh = generate(data, p, anchor).filter((c) => !p.knownSignatures.has(c.signature));
    const [pick] = pickDistinct(fresh.sort(byScore((c) => 0.5 * novelty(c.ids, p) + 0.5 * c.score)), 1, chosen);
    if (!pick) continue;
    chosen.push(pick);
    const name = anchor.name ?? "un capo";
    const last = p.lastWorn.get(anchor.id);
    const usage = !last ? "mai indossato" : diffDays(ctx.today, last) >= RECENT_DAYS ? "che non indossi da un po'" : "tra i meno usati";
    result.push(describe(pick, p, null, `valorizza ${name}, ${usage}`));
  }
  return result;
}
