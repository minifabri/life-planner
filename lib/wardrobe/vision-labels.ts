import type { WardrobeCategory } from "../supabase/types";

/**
 * Ciò che il riconoscimento dalla foto sa nominare. Il modello gira nel dispositivo e confronta la foto
 * con queste descrizioni (in inglese, la lingua in cui è stato addestrato); all'app tornano i nomi italiani.
 * Dopo ogni modifica a questo file: `pnpm build:vision` rigenera `vision-embeddings.gen.json`.
 */

/** Come si accorda l'aggettivo del colore: maschile/femminile, singolare/plurale. */
export type Form = "ms" | "mp" | "fs" | "fp";

export type GarmentType = { name: string; category: WardrobeCategory; form: Form; prompt: string };

export const GARMENT_TYPES: GarmentType[] = [
  { name: "maglietta", category: "top", form: "fs", prompt: "a t-shirt" },
  { name: "camicia", category: "top", form: "fs", prompt: "a button-up shirt" },
  { name: "blusa", category: "top", form: "fs", prompt: "a blouse" },
  { name: "maglione", category: "top", form: "ms", prompt: "a knitted sweater" },
  { name: "dolcevita", category: "top", form: "ms", prompt: "a turtleneck sweater" },
  { name: "felpa", category: "top", form: "fs", prompt: "a sweatshirt or hoodie" },
  { name: "canotta", category: "top", form: "fs", prompt: "a tank top" },
  { name: "top corto", category: "top", form: "ms", prompt: "a crop top" },
  { name: "body", category: "top", form: "ms", prompt: "a bodysuit" },
  { name: "corsetto", category: "top", form: "ms", prompt: "a corset" },
  { name: "polo", category: "top", form: "fs", prompt: "a polo shirt" },

  { name: "jeans", category: "bottom", form: "mp", prompt: "a pair of jeans" },
  { name: "pantaloni", category: "bottom", form: "mp", prompt: "a pair of trousers" },
  { name: "leggings", category: "bottom", form: "mp", prompt: "a pair of leggings" },
  { name: "pantaloncini", category: "bottom", form: "mp", prompt: "a pair of shorts" },
  { name: "gonna", category: "bottom", form: "fs", prompt: "a skirt" },
  { name: "pantaloni della tuta", category: "bottom", form: "mp", prompt: "a pair of sweatpants" },

  { name: "vestito", category: "dress", form: "ms", prompt: "a dress" },
  { name: "tuta intera", category: "dress", form: "fs", prompt: "a jumpsuit" },

  { name: "cappotto", category: "outerwear", form: "ms", prompt: "a long coat" },
  { name: "giacca", category: "outerwear", form: "fs", prompt: "a jacket" },
  { name: "giacca di pelle", category: "outerwear", form: "fs", prompt: "a leather jacket" },
  { name: "piumino", category: "outerwear", form: "ms", prompt: "a puffer down jacket" },
  { name: "blazer", category: "outerwear", form: "ms", prompt: "a blazer" },
  { name: "trench", category: "outerwear", form: "ms", prompt: "a trench coat" },
  { name: "giubbotto di jeans", category: "outerwear", form: "ms", prompt: "a denim jacket" },
  { name: "gilet", category: "outerwear", form: "ms", prompt: "a vest or gilet" },
  { name: "cardigan", category: "outerwear", form: "ms", prompt: "a cardigan" },

  { name: "sneakers", category: "shoes", form: "fp", prompt: "a pair of sneakers" },
  { name: "stivali", category: "shoes", form: "mp", prompt: "a pair of tall boots" },
  { name: "stivaletti", category: "shoes", form: "mp", prompt: "a pair of ankle boots" },
  { name: "sandali", category: "shoes", form: "mp", prompt: "a pair of sandals" },
  { name: "décolleté", category: "shoes", form: "fp", prompt: "a pair of high heel shoes" },
  { name: "ballerine", category: "shoes", form: "fp", prompt: "a pair of ballet flats" },
  { name: "mocassini", category: "shoes", form: "mp", prompt: "a pair of loafers" },
  { name: "ciabatte", category: "shoes", form: "fp", prompt: "a pair of slippers or slides" },

  { name: "borsa", category: "bag", form: "fs", prompt: "a handbag" },
  { name: "zaino", category: "bag", form: "ms", prompt: "a backpack" },
  { name: "shopper", category: "bag", form: "fs", prompt: "a tote bag" },
  { name: "pochette", category: "bag", form: "fs", prompt: "a clutch bag" },
  { name: "marsupio", category: "bag", form: "ms", prompt: "a belt bag" },

  { name: "sciarpa", category: "accessory", form: "fs", prompt: "a scarf" },
  { name: "cappello", category: "accessory", form: "ms", prompt: "a hat" },
  { name: "berretto", category: "accessory", form: "ms", prompt: "a beanie" },
  { name: "cintura", category: "accessory", form: "fs", prompt: "a belt" },
  { name: "occhiali da sole", category: "accessory", form: "mp", prompt: "a pair of sunglasses" },
  { name: "guanti", category: "accessory", form: "mp", prompt: "a pair of gloves" },
  { name: "collana", category: "accessory", form: "fs", prompt: "a necklace" },
  { name: "orecchini", category: "accessory", form: "mp", prompt: "a pair of earrings" },
  { name: "bracciale", category: "accessory", form: "ms", prompt: "a bracelet" },
  { name: "orologio", category: "accessory", form: "ms", prompt: "a wristwatch" },
  { name: "cravatta", category: "accessory", form: "fs", prompt: "a necktie" },
  { name: "calze", category: "accessory", form: "fp", prompt: "a pair of socks" },
  { name: "collant", category: "accessory", form: "mp", prompt: "a pair of tights" },

  { name: "costume da bagno", category: "other", form: "ms", prompt: "a swimsuit" },
  { name: "intimo", category: "other", form: "ms", prompt: "underwear" },
  { name: "pigiama", category: "other", form: "ms", prompt: "pajamas" },
];

export const TYPE_TEMPLATE = "a photo of {}, a type of fashion product";

/** Gli stili dell'app (`STYLE_OPTIONS`) descritti al modello. */
export const STYLE_PROMPTS: Record<string, string> = {
  minimal: "a photo of minimalist plain clothing",
  urban: "a photo of urban streetwear clothing",
  gothic: "a photo of gothic clothing",
  elegante: "a photo of elegant formal clothing",
  cyber: "a photo of futuristic cyberpunk techwear clothing",
  sportivo: "a photo of athletic sportswear",
  casual: "a photo of casual everyday clothing",
};

/** Materiali che si riconoscono a occhio: gli altri restano da scrivere a mano. */
export const MATERIAL_PROMPTS: Record<string, string> = {
  pelle: "a photo of clothing made of leather",
  jeans: "a photo of clothing made of denim",
  lana: "a photo of clothing made of knitted wool",
  pizzo: "a photo of clothing made of lace",
  velluto: "a photo of clothing made of velvet",
  raso: "a photo of clothing made of shiny satin",
  cotone: "a photo of clothing made of plain cotton fabric",
  "tessuto tecnico": "a photo of clothing made of nylon technical fabric",
};

/** L'elenco ordinato delle descrizioni: l'ordine è quello delle righe in `vision-embeddings.gen.json`. */
export function visionPrompts(): { types: string[]; styles: string[]; materials: string[] } {
  return {
    types: GARMENT_TYPES.map((t) => TYPE_TEMPLATE.replace("{}", t.prompt)),
    styles: Object.values(STYLE_PROMPTS),
    materials: Object.values(MATERIAL_PROMPTS),
  };
}

/** Il tipo di capo con questo nome, se è tra quelli noti (serve ad accordare l'aggettivo nel nome proposto). */
export function garmentTypeNamed(name: string): GarmentType | null {
  const wanted = name.trim().toLowerCase();
  return GARMENT_TYPES.find((t) => t.name === wanted) ?? null;
}
