import { describe, expect, it } from "vitest";
import { colorsFromText, compatibility, guessGarment, wardrobeRowFromWish } from "./wishlist";
import type { Outfit, WardrobeItem } from "../supabase/types";

function item(id: string, patch: Partial<WardrobeItem> = {}): WardrobeItem {
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
    wash_group: null,
    wishlist_item_id: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function outfit(id: string, itemIds: string[], patch: Partial<Outfit> = {}): Outfit {
  return { id, name: id, item_ids: itemIds, styles: [], occasions: [], seasons: [], favorite: false, notes: null, deleted_at: null, created_at: "2026-10-01T08:00:00Z", updated_at: "2026-10-01T08:00:00Z", ...patch };
}

describe("guessGarment", () => {
  it("riconosce il tipo di capo dal nome", () => {
    expect(guessGarment("Stivaletti neri senza lacci")).toBe("shoes");
    expect(guessGarment("Gonna midi plissé")).toBe("bottom");
    expect(guessGarment("Cappotto lungo")).toBe("outerwear");
    expect(guessGarment("Maglia semitrasparente")).toBe("top");
    expect(guessGarment("Collana dorata")).toBe("accessory");
  });

  it("non azzarda quando il nome non dice nulla", () => {
    expect(guessGarment("Siero vitamina C")).toBeNull();
  });
});

describe("wardrobeRowFromWish", () => {
  const wish = { id: "w1", name: "Stivaletti neri", brand: "Vagabond", image_url: "https://example.com/a.jpg", notes: null };

  it("porta nel capo nome, marca, immagine e il legame con l'articolo", () => {
    const row = wardrobeRowFromWish({ ...wish, garment: "shoes", colors: ["nero"], styles: ["gothic"] });
    expect(row).toMatchObject({ name: "Stivaletti neri", category: "shoes", brand: "Vagabond", colors: ["nero"], styles: ["gothic"], image_url: "https://example.com/a.jpg", wishlist_item_id: "w1" });
    expect(row.seasons).toEqual(["autumn", "winter"]);
  });

  it("senza tipo di capo lo ricava dal nome, altrimenti resta \"altro\"", () => {
    expect(wardrobeRowFromWish(wish).category).toBe("shoes");
    expect(wardrobeRowFromWish({ ...wish, name: "Regalo" }).category).toBe("other");
  });
});

describe("compatibility", () => {
  const items = [
    item("top-nero", { colors: ["nero"], styles: ["gothic"] }),
    item("top-rosso", { colors: ["rosso"] }),
    item("gonna-nera", { category: "bottom", colors: ["nero"], styles: ["gothic"], favorite: true }),
    item("jeans", { category: "bottom", colors: ["blu"] }),
    item("stivali-neri", { category: "shoes", colors: ["nero"] }),
    item("senza-colori", { category: "bottom" }),
  ];
  const outfits = [outfit("senza-scarpe", ["top-nero", "gonna-nera"]), outfit("con-scarpe", ["top-nero", "gonna-nera", "stivali-neri"]), outfit("rosso", ["top-rosso", "jeans"])];

  it("senza tipo di capo non dice nulla e spiega cosa manca", () => {
    const result = compatibility({ colors: ["nero"] }, items, outfits);
    expect(result.matches).toEqual([]);
    expect(result.hints[0]).toContain("che tipo di capo");
  });

  it("senza colori non azzarda abbinamenti", () => {
    const result = compatibility({ garment: "shoes" }, items, outfits);
    expect(result.similar).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.hints[0]).toContain("colori");
  });

  it("trova i capi simili: stesso tipo e un colore in comune", () => {
    expect(compatibility({ garment: "shoes", colors: ["nero"] }, items, outfits).similar.map((i) => i.id)).toEqual(["stivali-neri"]);
    expect(compatibility({ garment: "shoes", colors: ["lilla"] }, items, outfits).similar).toEqual([]);
  });

  it("propone abbinamenti con i colori in armonia, prima quelli dello stesso stile", () => {
    const result = compatibility({ garment: "top", colors: ["lilla"], styles: ["gothic"] }, items, outfits);
    expect(result.matches.map((i) => i.id)).toEqual(["gonna-nera", "stivali-neri"]);
  });

  it("non abbina con capi di cui non conosce i colori", () => {
    expect(compatibility({ garment: "top", colors: ["nero"] }, items, outfits).matches.map((i) => i.id)).not.toContain("senza-colori");
  });

  it("trova gli outfit a cui manca proprio quel tipo di capo", () => {
    expect(compatibility({ garment: "shoes", colors: ["nero"] }, items, outfits).completes.map((o) => o.id)).toEqual(["senza-scarpe"]);
  });

  it("un outfit con colori che stonano non viene proposto", () => {
    expect(compatibility({ garment: "shoes", colors: ["verde"] }, items, outfits).completes.map((o) => o.id)).toEqual(["senza-scarpe"]);
    expect(compatibility({ garment: "shoes", colors: ["verde"] }, items, [outfit("rosso", ["top-rosso", "jeans"])]).completes).toEqual([]);
  });
});

describe("colorsFromText", () => {
  it("trova i colori nel titolo, in italiano e in inglese", () => {
    expect(colorsFromText("Stivaletti neri in pelle")).toEqual(["nero"]);
    expect(colorsFromText("Maglia a righe bianca e blu")).toEqual(["bianco", "blu"]);
    expect(colorsFromText("Oversized Shirt - Light Blue")).toEqual(["azzurro"]);
    expect(colorsFromText("Borsa bordò con catena dorata")).toEqual(["bordeaux", "oro"]);
  });

  it("conta solo parole intere", () => {
    expect(colorsFromText("Rossetti e orologio")).toEqual([]);
    expect(colorsFromText("Cappotto lungo")).toEqual([]);
  });
});
