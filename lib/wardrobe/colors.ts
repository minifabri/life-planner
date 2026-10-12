import type { WardrobeCategory } from "../supabase/types";

/**
 * Riconoscimento locale dei colori di una foto e proposta del nome: nessun servizio esterno.
 * Sono proposte: chi compila corregge con un tocco.
 */

/** Il colore della tavolozza dell'app più vicino a un pixel (componenti 0–255). */
export function paletteColor(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (lightness < 0.18) return "nero";
  if (saturation < 0.14) return lightness > 0.82 ? "bianco" : lightness > 0.62 ? "argento" : "grigio";
  if (lightness > 0.9) return "bianco";

  let hue = 0;
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  if (hue < 18 || hue >= 340) return "rosso";
  if (hue < 65) return saturation < 0.45 || lightness > 0.7 ? "beige" : "oro";
  if (hue < 170) return "verde";
  if (hue < 255) return "blu";
  return "lilla";
}

const MIN_SHARE = 0.22;
const MAX_COLORS = 2;

/**
 * I colori dominanti di un'immagine (dati RGBA, come da un canvas): al più due, e solo se coprono
 * una parte consistente. Se nessun colore prevale non propone nulla.
 */
export function dominantColors(rgba: ArrayLike<number>): string[] {
  const count = new Map<string, number>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const color = paletteColor(rgba[i], rgba[i + 1], rgba[i + 2]);
    count.set(color, (count.get(color) ?? 0) + 1);
    total++;
  }
  if (total === 0) return [];
  return [...count.entries()]
    .filter(([, n]) => n / total >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_COLORS)
    .map(([color]) => color);
}

type Form = "ms" | "mp" | "fs" | "fp";

/** Il nome generico di una categoria e come si accorda l'aggettivo. */
const NOUN: Record<WardrobeCategory, { noun: string; form: Form }> = {
  top: { noun: "Top", form: "ms" },
  bottom: { noun: "Pantaloni", form: "mp" },
  dress: { noun: "Vestito", form: "ms" },
  outerwear: { noun: "Capospalla", form: "ms" },
  shoes: { noun: "Scarpe", form: "fp" },
  accessory: { noun: "Accessorio", form: "ms" },
  bag: { noun: "Borsa", form: "fs" },
  other: { noun: "Capo", form: "ms" },
};

/** Colori che cambiano desinenza; gli altri (lilla, beige, blu, oro, argento) restano uguali. */
const INFLECTED: Record<string, Record<Form, string>> = {
  nero: { ms: "nero", mp: "neri", fs: "nera", fp: "nere" },
  bianco: { ms: "bianco", mp: "bianchi", fs: "bianca", fp: "bianche" },
  grigio: { ms: "grigio", mp: "grigi", fs: "grigia", fp: "grigie" },
  rosso: { ms: "rosso", mp: "rossi", fs: "rossa", fp: "rosse" },
  verde: { ms: "verde", mp: "verdi", fs: "verde", fp: "verdi" },
};

/**
 * Nome da proporre per un capo: la sottocategoria se c'è (scritta da chi compila, quindi senza accordo),
 * altrimenti il nome generico della categoria, più il colore principale. Es. "Top nero", "Scarpe bianche".
 */
export function suggestName(category: WardrobeCategory, subcategory: string | null, colors: string[]): string {
  const color = colors.find((c) => c !== "altro");
  const custom = subcategory?.trim();
  if (custom) return color ? `${custom.charAt(0).toUpperCase()}${custom.slice(1)} ${color}` : `${custom.charAt(0).toUpperCase()}${custom.slice(1)}`;
  const { noun, form } = NOUN[category];
  return color ? `${noun} ${INFLECTED[color]?.[form] ?? color}` : noun;
}
