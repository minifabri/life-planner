import type { WardrobeCategory } from "../supabase/types";
import { GARMENT_TYPES, MATERIAL_PROMPTS, STYLE_PROMPTS, type GarmentType } from "./vision-labels";

/**
 * Dal vettore che il modello ricava da una foto a ciò che l'app propone: categoria, tipo di capo, stile, materiale.
 * Logica pura: il modello (`vision-model.ts`) produce il vettore, qui lo si confronta con le descrizioni
 * già calcolate (`vision-embeddings.gen.json`). Sono proposte: sotto una certa sicurezza non si propone nulla.
 */

export type VisionTable = { types: Float32Array[]; styles: Float32Array[]; materials: Float32Array[] };

export type Recognition = {
  category: WardrobeCategory | null;
  type: GarmentType | null;
  styles: string[];
  material: string | null;
};

export const NOTHING: Recognition = { category: null, type: null, styles: [], material: null };

/** Quanto il modello accentua le differenze tra somiglianze (la sua "temperatura" di addestramento). */
const SCALE = 100;
/** Sotto questa somiglianza con la descrizione migliore la foto non sembra un capo. */
const MIN_SIMILARITY = 0.2;
const MIN_CATEGORY = 0.6;
const MIN_TYPE = 0.5;
/** Tra due tipi quasi alla pari (stivali o stivaletti?) si propone solo la categoria. */
const MIN_TYPE_LEAD = 0.1;
const MIN_STYLE = 0.6;
/** Il materiale si scrive in un campo libero: lo si propone solo quando è evidente. */
const MIN_MATERIAL = 0.9;
/** Il blu inganna: "jeans" si propone solo dove il denim è plausibile. */
const DENIM_CATEGORIES: WardrobeCategory[] = ["bottom", "outerwear", "dress"];

/** Tipi che dicono già di che cosa sono fatti. */
const TYPE_MATERIAL: Record<string, string> = {
  "giacca di pelle": "pelle",
  jeans: "jeans",
  "giubbotto di jeans": "jeans",
  maglione: "lana",
  dolcevita: "lana",
  cardigan: "lana",
};

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Le impronte delle descrizioni, nell'ordine di `visionPrompts()`: prima i tipi, poi gli stili, poi i materiali. */
export function decodeTable(gen: { dim: number; data: string }): VisionTable {
  const bytes = decodeBase64(gen.data);
  const view = new DataView(bytes.buffer);
  const count = bytes.length / 2 / gen.dim;
  const rows = Array.from({ length: count }, (_, r) => {
    const row = new Float32Array(gen.dim);
    for (let i = 0; i < gen.dim; i++) row[i] = view.getInt16((r * gen.dim + i) * 2, true) / 32767;
    return row;
  });
  const typeCount = GARMENT_TYPES.length;
  const styleCount = Object.keys(STYLE_PROMPTS).length;
  return { types: rows.slice(0, typeCount), styles: rows.slice(typeCount, typeCount + styleCount), materials: rows.slice(typeCount + styleCount) };
}

function similarities(rows: Float32Array[], unit: Float32Array): number[] {
  return rows.map((row) => {
    let dot = 0;
    for (let i = 0; i < unit.length; i++) dot += row[i] * unit[i];
    return dot;
  });
}

/** Da somiglianze a quote che sommano a 1. */
function shares(sims: number[]): number[] {
  const max = Math.max(...sims);
  const weights = sims.map((s) => Math.exp((s - max) * SCALE));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

function best(values: number[]): number {
  return values.indexOf(Math.max(...values));
}

export function recognize(embedding: ArrayLike<number>, table: VisionTable): Recognition {
  let norm = 0;
  for (let i = 0; i < embedding.length; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm);
  if (!norm) return NOTHING;
  const unit = Float32Array.from(embedding, (x) => x / norm);

  const typeSims = similarities(table.types, unit);
  if (Math.max(...typeSims) < MIN_SIMILARITY) return NOTHING;
  const typeShares = shares(typeSims);

  // La categoria somma i tipi che le appartengono: stivali e stivaletti si confondono tra loro, ma sono comunque scarpe.
  const byCategory = new Map<WardrobeCategory, number>();
  GARMENT_TYPES.forEach((t, i) => byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + typeShares[i]));
  const [category, categoryShare] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  if (categoryShare < MIN_CATEGORY) return NOTHING;

  const top = best(typeShares);
  const runnerUp = Math.max(...typeShares.filter((_, i) => i !== top));
  const clear = typeShares[top] >= MIN_TYPE && typeShares[top] - runnerUp >= MIN_TYPE_LEAD;
  const type = clear && GARMENT_TYPES[top].category === category ? GARMENT_TYPES[top] : null;

  const styleShares = shares(similarities(table.styles, unit));
  const topStyle = best(styleShares);
  const styles = styleShares[topStyle] >= MIN_STYLE ? [Object.keys(STYLE_PROMPTS)[topStyle]] : [];

  const materialShares = shares(similarities(table.materials, unit));
  const topMaterial = best(materialShares);
  const seen = materialShares[topMaterial] >= MIN_MATERIAL ? Object.keys(MATERIAL_PROMPTS)[topMaterial] : null;
  const material = (type && TYPE_MATERIAL[type.name]) ?? (seen === "jeans" && !DENIM_CATEGORIES.includes(category) ? null : seen);

  return { category, type, styles, material };
}
