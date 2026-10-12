import type { Outfit, WardrobeCategory, WardrobeItem, WishlistItem } from "../supabase/types";
import { suggestDefaults } from "./catalog";
import { resolveItems } from "./outfits";
import { NEUTRALS } from "./suggest";

/** Parole nel nome che fanno pensare a un tipo di capo. Serve solo a proporre: decide sempre chi compila. */
const GARMENT_RULES: { match: RegExp; garment: WardrobeCategory }[] = [
  { match: /cappotto|piumino|parka|giacc|giubbott|trench|blazer|cardigan/i, garment: "outerwear" },
  { match: /vestito|abito|tubino/i, garment: "dress" },
  { match: /stival|scarp|sneaker|sandal|décolleté|decollete|mocassin|ballerin|anfibi/i, garment: "shoes" },
  { match: /borsa|zaino|pochette|tracolla|shopper/i, garment: "bag" },
  { match: /collana|orecchin|braccial|anello|cintura|sciarpa|cappello|guanti|occhiali/i, garment: "accessory" },
  { match: /pantalon|jeans|gonna|shorts|leggings/i, garment: "bottom" },
  { match: /magli|camici|blusa|top\b|t-shirt|felpa|canotta|body\b|dolcevita/i, garment: "top" },
];

export function guessGarment(name: string): WardrobeCategory | null {
  return GARMENT_RULES.find((rule) => rule.match.test(name))?.garment ?? null;
}

type WishGarment = Pick<WishlistItem, "id" | "name" | "brand" | "image_url" | "notes"> & Partial<Pick<WishlistItem, "garment" | "colors" | "styles">>;

/** Il capo da creare quando un articolo della wishlist entra nel guardaroba: niente da reinserire a mano. */
export function wardrobeRowFromWish(wish: WishGarment) {
  const category = wish.garment ?? guessGarment(wish.name) ?? "other";
  const defaults = suggestDefaults(category, wish.name);
  return {
    name: wish.name,
    category,
    brand: wish.brand,
    colors: wish.colors ?? [],
    styles: wish.styles?.length ? wish.styles : defaults.styles,
    seasons: defaults.seasons,
    occasions: defaults.occasions,
    warmth: defaults.warmth,
    layerable: defaults.layerable,
    // Resta l'immagine del negozio finché non c'è una foto propria.
    image_url: wish.image_url,
    notes: wish.notes,
    wishlist_item_id: wish.id,
  };
}

/** Con quali categorie si abbina, di norma, un capo di una certa categoria. */
const COMPLEMENTS: Record<WardrobeCategory, WardrobeCategory[]> = {
  top: ["bottom", "outerwear", "shoes"],
  bottom: ["top", "outerwear", "shoes"],
  dress: ["outerwear", "shoes", "accessory", "bag"],
  outerwear: ["top", "bottom", "dress"],
  shoes: ["top", "bottom", "dress"],
  accessory: ["top", "dress", "outerwear"],
  bag: ["top", "dress", "outerwear"],
  other: [],
};

/** Le categorie che occupano lo stesso "posto" in un outfit (un vestito fa da top e da bottom). */
const SAME_SLOT: Record<WardrobeCategory, WardrobeCategory[]> = {
  top: ["top", "dress"],
  bottom: ["bottom", "dress"],
  dress: ["dress", "top", "bottom"],
  outerwear: ["outerwear"],
  shoes: ["shoes"],
  accessory: ["accessory"],
  bag: ["bag"],
  other: ["other"],
};

const MAX_ITEMS = 6;
const MAX_OUTFITS = 4;

function accents(colors: string[]): Set<string> {
  return new Set(colors.filter((c) => !NEUTRALS.includes(c)));
}

/** I colori stanno bene insieme se, tolti i neutri, resta al più un colore. */
function harmonious(a: string[], b: string[]): boolean {
  return accents([...a, ...b]).size <= 1;
}

export type Compatibility = {
  /** Capi posseduti dello stesso tipo e con un colore in comune. */
  similar: WardrobeItem[];
  /** Capi posseduti con cui si abbinerebbe. */
  matches: WardrobeItem[];
  /** Outfit salvati a cui manca proprio questo tipo di capo, e con cui i colori stanno bene. */
  completes: Outfit[];
  /** Cosa manca per poter dire di più: non si deduce nulla dai dati che non ci sono. */
  hints: string[];
};

/**
 * Confronto tra un articolo desiderato e il guardaroba, fatto solo con i dati presenti:
 * senza il tipo di capo non dice nulla, senza i colori non azzarda abbinamenti.
 */
export function compatibility(wish: Partial<Pick<WishlistItem, "garment" | "colors" | "styles">>, items: WardrobeItem[], outfits: Outfit[]): Compatibility {
  const garment = wish.garment ?? null;
  const colors = wish.colors ?? [];
  const styles = wish.styles ?? [];
  if (!garment) return { similar: [], matches: [], completes: [], hints: ["Indica che tipo di capo è per confrontarlo con il guardaroba."] };
  if (colors.length === 0) return { similar: [], matches: [], completes: [], hints: ["Aggiungi i colori per sapere se hai già qualcosa di simile e con cosa si abbina."] };

  const owned = items.filter((i) => !i.deleted_at);
  const similar = owned.filter((i) => i.category === garment && i.colors.some((c) => colors.includes(c))).slice(0, MAX_ITEMS);

  const matches = owned
    .filter((i) => COMPLEMENTS[garment].includes(i.category) && i.colors.length > 0 && harmonious(colors, i.colors))
    .map((item) => ({ item, score: (item.styles.some((s) => styles.includes(s)) ? 2 : 0) + (item.favorite ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || b.item.created_at.localeCompare(a.item.created_at))
    .slice(0, MAX_ITEMS)
    .map((e) => e.item);

  const completes = outfits
    .filter((o) => !o.deleted_at)
    .filter((o) => {
      const parts = resolveItems(o.item_ids, owned).items;
      if (parts.length === 0 || parts.some((i) => SAME_SLOT[garment].includes(i.category))) return false;
      const declared = parts.filter((i) => i.colors.length > 0);
      return declared.length > 0 && harmonious(colors, declared.flatMap((i) => i.colors));
    })
    .slice(0, MAX_OUTFITS);

  const hints = owned.length === 0 ? ["Il guardaroba è vuoto: aggiungi qualche capo per il confronto."] : [];
  return { similar, matches, completes, hints };
}
