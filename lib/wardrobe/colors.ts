import type { WardrobeCategory } from "../supabase/types";
import { garmentTypeNamed, type Form } from "./vision-labels";

/**
 * Riconoscimento locale dei colori di una foto e proposta del nome: nessun servizio esterno.
 * Sono proposte: chi compila corregge con un tocco.
 */

/** Da sRGB (0–255) a OKLCH: luminosità 0–1, intensità del colore, tinta in gradi. Le distanze qui seguono l'occhio. */
function oklab(r: number, g: number, b: number): [number, number, number] {
  const linear = (c: number) => (c <= 10.31475 ? c / 3294.6 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Come `paletteColor`, ma distingue il grigio scuro e quello chiaro: in foto sono spesso nero e bianco in ombra. */
type Shade = string;
const DARK_GREY = "grigio scuro";
const DARK_TINT = 0.028;
const LIGHT_GREY = "grigio chiaro";

function shadeOf(r: number, g: number, b: number): Shade {
  const [L, a, bb] = oklab(r, g, b);
  const C = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  const grey = L < 0.4 ? "nero" : L > 0.85 ? "bianco" : L < 0.5 ? DARK_GREY : L >= 0.68 ? LIGHT_GREY : "grigio";

  // Senza tinta, o così scuro che la tinta non si vede.
  if (C < 0.022 || (L < 0.2 && C < 0.08)) return grey;

  // Tinta appena accennata: i toni caldi sono beige e marroni, i rosati chiari sono rosa, il resto è grigio.
  // Nei colori scuri la tinta si vede meno a parità di tessuto (un blu notte, un verde bosco): lì basta meno.
  const warm = h >= 30 && h < 115;
  if (C < (L < 0.45 && !warm ? DARK_TINT : 0.045)) {
    if (warm) return L > 0.9 ? "bianco" : L > 0.6 ? "beige" : L >= 0.25 && C >= 0.03 ? "marrone" : grey;
    if ((h >= 340 || h < 30) && L > 0.7) return "rosa";
    return grey;
  }

  if (h < 20 || h >= 335) return L < 0.45 ? "bordeaux" : h >= 10 && h < 20 && C > 0.15 ? "rosso" : "rosa";
  if (h < 40) return L >= 0.72 ? "rosa" : C < 0.1 ? "marrone" : L < 0.42 ? "bordeaux" : "rosso";
  if (h < 75) return L >= 0.5 && C >= 0.13 ? "arancione" : L >= 0.68 ? "beige" : "marrone";
  if (h < 115) return L >= 0.65 && C >= 0.11 ? "giallo" : L >= 0.68 ? "beige" : h >= 95 ? "verde" : "marrone";
  if (h < 205) return "verde";
  if (h < 285) return L >= 0.72 ? "azzurro" : "blu";
  return "lilla";
}

/** Il colore della tavolozza dell'app più vicino a un pixel (componenti 0–255). Oro e argento non si leggono da una foto: li sceglie chi compila. */
export function paletteColor(r: number, g: number, b: number): string {
  const shade = shadeOf(r, g, b);
  return shade === DARK_GREY || shade === LIGHT_GREY ? "grigio" : shade;
}

/** Sotto questa differenza due pixel vicini sono lo stesso sfondo; oltre la seconda soglia non è più lo sfondo dei bordi. */
const STEP = 0.04;
const REACH = 0.2;
const MIN_UNIFORM_BORDER = 0.5;
const MIN_GARMENT = 0.12;

/**
 * Quali pixel sono il capo e quali lo sfondo (1 = capo). Lo sfondo è il colore che prevale lungo i bordi
 * e tutto ciò che gli somiglia partendo da lì: una parete, un letto, il pavimento, anche con ombre graduali.
 * Se i bordi non hanno un colore prevalente, o lo sfondo si mangia quasi tutto, si torna al riquadro centrale.
 */
export function garmentMask(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const total = width * height;
  const lab = new Float32Array(total * 3);
  for (let i = 0; i < total; i++) lab.set(oklab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]), i * 3);
  const distance = (i: number, L: number, a: number, b: number) => Math.hypot(lab[i * 3] - L, lab[i * 3 + 1] - a, lab[i * 3 + 2] - b);

  const centre = () => {
    const mask = new Uint8Array(total);
    for (let y = Math.floor(height * 0.25); y < height * 0.75; y++) for (let x = Math.floor(width * 0.25); x < width * 0.75; x++) mask[y * width + x] = 1;
    return mask;
  };

  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);

  // Il colore di sfondo: la casella più affollata tra i pixel del bordo, a passi larghi.
  const cells = new Map<string, number[]>();
  for (const i of border) {
    const key = `${Math.round(lab[i * 3] * 8)},${Math.round(lab[i * 3 + 1] * 16)},${Math.round(lab[i * 3 + 2] * 16)}`;
    cells.set(key, [...(cells.get(key) ?? []), i]);
  }
  const crowd = [...cells.values()].sort((a, b) => b.length - a.length)[0];
  const mean = [0, 1, 2].map((k) => crowd.reduce((sum, i) => sum + lab[i * 3 + k], 0) / crowd.length) as [number, number, number];
  const seeds = border.filter((i) => distance(i, ...mean) < REACH / 2);
  if (seeds.length < border.length * MIN_UNIFORM_BORDER) return centre();

  const mask = new Uint8Array(total).fill(1);
  const queue = seeds.slice();
  for (const i of seeds) mask[i] = 0;
  while (queue.length > 0) {
    const i = queue.pop() as number;
    const x = i % width;
    for (const n of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
      if (n < 0 || n >= total || mask[n] === 0) continue;
      if (distance(n, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]) < STEP && distance(n, ...mean) < REACH) {
        mask[n] = 0;
        queue.push(n);
      }
    }
  }
  let kept = 0;
  for (let i = 0; i < total; i++) kept += mask[i];
  return kept < total * MIN_GARMENT ? centre() : mask;
}

const MIN_SHARE = 0.22;
const MAX_COLORS = 2;
/** Quota oltre la quale una sfumatura vicina al colore principale è un secondo colore vero, non un'ombra. */
const MIN_SHADE_SHARE = 0.4;
/** Un capo scuro e colorato ha pieghe nere, un capo nero non ha parti colorate: da questa quota vince il colore. */
const DARK_COLOUR_SHARE = 0.25;
/** Quanta parte di nero tra i grigi scuri, e di bianco tra i grigi chiari, perché quei grigi siano le sue pieghe e ombre. */
const SHADOWS: [grey: Shade, pure: string, share: number][] = [
  [DARK_GREY, "nero", 0.5],
  [LIGHT_GREY, "bianco", 0.3],
];

/** Coppie in cui il secondo colore è di solito luce o ombra del primo sullo stesso tessuto. */
const SHADES: [string, string][] = [
  ["nero", "grigio"],
  ["bianco", "grigio"],
  ["bianco", "beige"],
  ["beige", "marrone"],
  ["marrone", "nero"],
  ["blu", "azzurro"],
  ["blu", "nero"],
  ["rosso", "bordeaux"],
  ["bordeaux", "nero"],
  ["rosa", "rosso"],
  ["verde", "nero"],
  ["arancione", "marrone"],
  ["giallo", "beige"],
];

function related(a: string, b: string): boolean {
  return SHADES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * I colori dominanti di un'immagine (dati RGBA, come da un canvas): al più due, e solo se coprono
 * una parte consistente. Con `mask` contano solo i pixel del capo. Se nessun colore prevale non propone nulla.
 */
export function dominantColors(rgba: ArrayLike<number>, mask?: ArrayLike<number>): string[] {
  const count = new Map<string, number>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128 || (mask && !mask[i / 4])) continue;
    const shade = shadeOf(rgba[i], rgba[i + 1], rgba[i + 2]);
    count.set(shade, (count.get(shade) ?? 0) + 1);
    total++;
  }
  if (total === 0) return [];

  // Un capo nero in foto ha pieghe grigio scuro, uno bianco ha ombre grigio chiaro: contano come nero e bianco.
  for (const [grey, pure, share] of SHADOWS) {
    const greys = count.get(grey) ?? 0;
    const pures = count.get(pure) ?? 0;
    const target = pures > 0 && pures >= (greys + pures) * share ? pure : "grigio";
    count.set(target, (count.get(target) ?? 0) + greys);
    count.delete(grey);
  }

  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let [first] = ranked;
  if (first[0] === "nero") first = ranked.find(([color, n]) => color !== "nero" && color !== "grigio" && related("nero", color) && n / total >= DARK_COLOUR_SHARE) ?? first;
  if (first[1] / total < MIN_SHARE) return [];
  // Accanto a un colore scuro il nero è la sua ombra, mai un secondo colore.
  const shadow = first[0] !== "grigio" && related(first[0], "nero") ? "nero" : null;
  const second = ranked.find(([color, n]) => color !== first[0] && color !== shadow && n / total >= (related(first[0], color) ? MIN_SHADE_SHARE : MIN_SHARE));
  return [first[0], ...(second ? [second[0]] : [])].slice(0, MAX_COLORS);
}

/** I colori del capo in una foto: prima si toglie lo sfondo, poi si contano i colori. */
export function garmentColors(rgba: ArrayLike<number>, width: number, height: number): string[] {
  return dominantColors(rgba, garmentMask(rgba, width, height));
}

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

/** Colori che cambiano desinenza; gli altri (lilla, beige, blu, rosa, bordeaux, oro, argento) restano uguali. */
const INFLECTED: Record<string, Record<Form, string>> = {
  nero: { ms: "nero", mp: "neri", fs: "nera", fp: "nere" },
  bianco: { ms: "bianco", mp: "bianchi", fs: "bianca", fp: "bianche" },
  grigio: { ms: "grigio", mp: "grigi", fs: "grigia", fp: "grigie" },
  rosso: { ms: "rosso", mp: "rossi", fs: "rossa", fp: "rosse" },
  verde: { ms: "verde", mp: "verdi", fs: "verde", fp: "verdi" },
  marrone: { ms: "marrone", mp: "marroni", fs: "marrone", fp: "marroni" },
  arancione: { ms: "arancione", mp: "arancioni", fs: "arancione", fp: "arancioni" },
  giallo: { ms: "giallo", mp: "gialli", fs: "gialla", fp: "gialle" },
  azzurro: { ms: "azzurro", mp: "azzurri", fs: "azzurra", fp: "azzurre" },
};

/**
 * Nome da proporre per un capo: la sottocategoria se c'è, altrimenti il nome generico della categoria, più il
 * colore principale. Es. "Top nero", "Scarpe bianche", "Gonna nera". L'aggettivo si accorda quando la
 * sottocategoria è un tipo di capo noto; una scritta a mano diversa resta com'è ("Gonna midi nero").
 */
export function suggestName(category: WardrobeCategory, subcategory: string | null, colors: string[]): string {
  const color = colors.find((c) => c !== "altro");
  const custom = subcategory?.trim();
  const { noun, form } = custom ? { noun: `${custom.charAt(0).toUpperCase()}${custom.slice(1)}`, form: garmentTypeNamed(custom)?.form ?? null } : NOUN[category];
  if (!color) return noun;
  return `${noun} ${(form && INFLECTED[color]?.[form]) ?? color}`;
}
