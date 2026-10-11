import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, seasonOf, signatureOf, suggestAround, suggestDiscover, suggestOutfits, type SuggestContext, type SuggestData } from "./suggest";
import type { OutfitFeedback, WardrobeItem, WardrobeWear } from "../supabase/types";

function item(id: string, patch: Partial<WardrobeItem>): WardrobeItem {
  return {
    id,
    name: id,
    image_path: null,
    thumb_path: null,
    image_url: null,
    category: "top",
    subcategory: null,
    colors: [],
    seasons: [],
    styles: [],
    occasions: [],
    material: null,
    brand: null,
    warmth: null,
    layerable: true,
    status: "clean",
    favorite: false,
    notes: null,
    deleted_at: null,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-01T08:00:00Z",
    ...patch,
  };
}

const WARDROBE: WardrobeItem[] = [
  item("top-nero", { colors: ["nero"], styles: ["minimal", "gothic"], occasions: ["serata", "quotidiano"], warmth: 2 }),
  item("top-lilla", { colors: ["lilla"], styles: ["minimal"], occasions: ["quotidiano", "ufficio"], warmth: 2 }),
  item("maglione", { colors: ["grigio"], styles: ["casual"], occasions: ["quotidiano"], warmth: 4 }),
  item("gonna", { category: "bottom", colors: ["nero"], styles: ["gothic", "elegante"], occasions: ["serata"], warmth: 2 }),
  item("pantaloni", { category: "bottom", colors: ["grigio"], styles: ["minimal"], occasions: ["ufficio", "quotidiano"], warmth: 3 }),
  item("jeans", { category: "bottom", colors: ["blu"], styles: ["casual"], occasions: ["quotidiano"], warmth: 3 }),
  item("vestito", { category: "dress", colors: ["nero"], styles: ["elegante"], occasions: ["serata", "cerimonia"], warmth: 2 }),
  item("stivali", { category: "shoes", colors: ["nero"], styles: ["gothic"], occasions: ["serata", "quotidiano"] }),
  item("sneakers", { category: "shoes", colors: ["bianco"], styles: ["casual"], occasions: ["quotidiano", "sport"] }),
  item("cappotto", { category: "outerwear", colors: ["nero"], styles: ["minimal"], warmth: 5 }),
  item("collana", { category: "accessory", colors: ["oro"], styles: ["elegante"], occasions: ["serata"] }),
];

function data(patch: Partial<SuggestData> = {}): SuggestData {
  return { items: WARDROBE, outfits: [], wears: [], feedback: [], style: DEFAULT_STYLE, ...patch };
}

const ctx: SuggestContext = { today: "2026-10-12", occasion: null, band: null };

function wear(id: string, wornOn: string, itemIds: string[]): WardrobeWear {
  return { id, worn_on: wornOn, outfit_id: null, item_ids: itemIds, created_at: `${wornOn}T08:00:00Z` };
}

function feedback(itemIds: string[], verdict: OutfitFeedback["verdict"]): OutfitFeedback {
  return { id: signatureOf(itemIds), item_ids: itemIds, signature: signatureOf(itemIds), verdict, created_at: "2026-10-01T08:00:00Z" };
}

describe("basi", () => {
  it("la firma non dipende dall'ordine", () => {
    expect(signatureOf(["b", "a"])).toBe(signatureOf(["a", "b"]));
  });

  it("ricava la stagione dalla data", () => {
    expect(seasonOf("2026-01-15")).toBe("winter");
    expect(seasonOf("2026-04-01")).toBe("spring");
    expect(seasonOf("2026-08-31")).toBe("summer");
    expect(seasonOf("2026-10-12")).toBe("autumn");
  });
});

describe("suggestOutfits", () => {
  it("è deterministico: stessi dati, stesse proposte", () => {
    expect(suggestOutfits(data(), ctx).map((s) => s.signature)).toEqual(suggestOutfits(data(), ctx).map((s) => s.signature));
  });

  it("propone combinazioni con una base (top e bottom, o vestito) e le scarpe", () => {
    const suggestions = suggestOutfits(data(), ctx);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      const categories = s.items.map((i) => i.category);
      expect(categories.includes("dress") || (categories.includes("top") && categories.includes("bottom"))).toBe(true);
      expect(categories).toContain("shoes");
    }
  });

  it("le proposte sono diverse tra loro", () => {
    const signatures = suggestOutfits(data(), ctx).map((s) => s.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("privilegia l'occasione richiesta", () => {
    const [first] = suggestOutfits(data(), { ...ctx, occasion: "serata" });
    expect(first.items.filter((i) => i.occasions.includes("serata")).length).toBeGreaterThanOrEqual(3);
    expect(first.reason).toContain("Adatto a: serata");
  });

  it("con il freddo aggiunge il capospalla, con il caldo no", () => {
    const cold = suggestOutfits(data(), { ...ctx, band: "cold" });
    const warm = suggestOutfits(data(), { ...ctx, band: "warm" });
    expect(cold.every((s) => s.items.some((i) => i.category === "outerwear"))).toBe(true);
    expect(warm.some((s) => s.items.some((i) => i.category === "outerwear"))).toBe(false);
  });

  it("dichiara quando non considera il meteo, e non lo dichiara se la temperatura è indicata", () => {
    expect(suggestOutfits(data(), ctx)[0].notes).toContain("Non considera il meteo.");
    expect(suggestOutfits(data(), { ...ctx, band: "mild" })[0].notes).not.toContain("Non considera il meteo.");
  });

  it("un capo da lavare abbassa la proposta ma non la elimina, e viene segnalato", () => {
    const items = WARDROBE.map((i) => (i.id === "stivali" || i.id === "sneakers" ? { ...i, status: "to_wash" as const } : i));
    const suggestions = suggestOutfits(data({ items }), ctx);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].notes).toContain("Contiene un capo da lavare.");
    expect(suggestions[0].reason).not.toContain("capi disponibili");
  });

  it("non ripropone una combinazione scartata", () => {
    const [first] = suggestOutfits(data(), ctx);
    const after = suggestOutfits(data({ feedback: [feedback(first.itemIds, "dislike")] }), ctx);
    expect(after.map((s) => s.signature)).not.toContain(first.signature);
  });

  it("un abbinamento piaciuto sale, e la motivazione lo dice", () => {
    const liked = ["maglione", "jeans", "sneakers"];
    const before = suggestOutfits(data(), ctx).findIndex((s) => liked.every((id) => s.itemIds.includes(id)));
    const afterList = suggestOutfits(data({ feedback: [feedback(liked, "like")] }), ctx);
    const after = afterList.findIndex((s) => liked.every((id) => s.itemIds.includes(id)));
    expect(after).toBeGreaterThanOrEqual(0);
    if (before >= 0) expect(after).toBeLessThanOrEqual(before);
    expect(afterList[after].reason).toContain("simile ad abbinamenti che ti sono piaciuti");
  });

  it("penalizza ciò che è stato indossato da poco", () => {
    const [first] = suggestOutfits(data(), ctx);
    const after = suggestOutfits(data({ wears: [wear("w1", "2026-10-11", first.itemIds)] }), ctx);
    expect(after[0].signature).not.toBe(first.signature);
  });

  it("senza dati sui capi non inventa motivazioni", () => {
    const bare = [item("t", {}), item("b", { category: "bottom" }), item("s", { category: "shoes" })];
    const [only] = suggestOutfits(data({ items: bare }), ctx);
    expect(only.reason).toBe("Composto da capi disponibili.");
  });

  it("senza una base possibile non propone nulla", () => {
    expect(suggestOutfits(data({ items: [item("t", {}), item("s", { category: "shoes" })] }), ctx)).toEqual([]);
  });

  it("un capo che il profilo preferisce evitare scende, ma resta proponibile", () => {
    const items = [
      item("blazer", { name: "Blazer nero", category: "outerwear", colors: ["nero"], warmth: 4 }),
      item("giacca", { name: "Giacca nera", category: "outerwear", colors: ["nero"], warmth: 4 }),
      item("t", { warmth: 2 }),
      item("b", { category: "bottom", warmth: 2 }),
    ];
    const [first] = suggestOutfits(data({ items }), { ...ctx, band: "cold" });
    expect(first.itemIds).toContain("giacca");
    const forced = suggestAround(data({ items }), { ...ctx, band: "cold" }, "blazer");
    expect(forced[0].itemIds).toContain("blazer");
  });
});

describe("suggestAround", () => {
  it("propone tre alternative etichettate, tutte con il capo scelto e diverse tra loro", () => {
    const suggestions = suggestAround(data(), ctx, "top-nero");
    expect(suggestions.map((s) => s.label)).toEqual(["Consigliato", "Elegante", "Alternativo"]);
    expect(suggestions.every((s) => s.itemIds.includes("top-nero"))).toBe(true);
    expect(new Set(suggestions.map((s) => s.signature)).size).toBe(3);
  });

  it("funziona anche partendo da scarpe o accessori", () => {
    expect(suggestAround(data(), ctx, "stivali").every((s) => s.itemIds.includes("stivali"))).toBe(true);
    expect(suggestAround(data(), ctx, "collana").every((s) => s.itemIds.includes("collana"))).toBe(true);
  });

  it("permette di forzare un capo da lavare", () => {
    const items = WARDROBE.map((i) => (i.id === "vestito" ? { ...i, status: "to_wash" as const } : i));
    const [first] = suggestAround(data({ items }), ctx, "vestito");
    expect(first.itemIds).toContain("vestito");
    expect(first.notes).toContain("Contiene un capo da lavare.");
  });

  it("un capo che non esiste non dà proposte", () => {
    expect(suggestAround(data(), ctx, "manca")).toEqual([]);
  });
});

describe("suggestDiscover", () => {
  const wears = [wear("w1", "2026-09-01", ["top-nero", "gonna", "stivali"]), wear("w2", "2026-09-20", ["top-lilla", "pantaloni", "sneakers"])];

  it("parte dai capi mai indossati e lo dice", () => {
    const suggestions = suggestDiscover(data({ wears }), ctx);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].reason).toContain("mai indossato");
    const neverWorn = ["maglione", "jeans", "vestito", "cappotto"];
    expect(suggestions.every((s) => s.itemIds.some((id) => neverWorn.includes(id)))).toBe(true);
  });

  it("non ripropone combinazioni già indossate o già salvate", () => {
    const known = new Set(wears.map((w) => signatureOf(w.item_ids)));
    expect(suggestDiscover(data({ wears }), ctx).some((s) => known.has(s.signature))).toBe(false);
  });
});
