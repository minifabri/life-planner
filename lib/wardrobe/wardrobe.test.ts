import { describe, expect, it } from "vitest";
import { suggestDefaults } from "./catalog";
import { fitWithin } from "./image";
import { distinctValues, duplicateName, filterWardrobe } from "./list";
import type { WardrobeItem } from "../supabase/types";

function item(patch: Partial<WardrobeItem>): WardrobeItem {
  return {
    id: "1",
    name: "Capo",
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
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...patch,
  };
}

describe("classificazione assistita", () => {
  it("suggerisce in base alla categoria", () => {
    expect(suggestDefaults("outerwear", "Giacca")).toEqual({
      seasons: ["autumn", "winter"],
      styles: [],
      occasions: ["quotidiano"],
      warmth: 4,
      layerable: true,
    });
  });

  it("affina il suggerimento dalle parole nel nome", () => {
    const cappotto = suggestDefaults("outerwear", "Cappotto lungo nero");
    expect(cappotto.warmth).toBe(5);
    expect(cappotto.seasons).toEqual(["autumn", "winter"]);

    const canotta = suggestDefaults("top", "Canotta bianca");
    expect(canotta.seasons).toEqual(["summer"]);
    expect(canotta.warmth).toBe(1);

    const trasparente = suggestDefaults("top", "Maglia nera semitrasparente");
    expect(trasparente.styles).toEqual(["elegante", "gothic"]);
    expect(trasparente.occasions).toEqual(["serata"]);
  });

  it("legge i tipi di capo riconosciuti dalla foto", () => {
    expect(suggestDefaults("top", " maglietta")).toMatchObject({ seasons: ["spring", "summer"], warmth: 1 });
    expect(suggestDefaults("top", " dolcevita")).toMatchObject({ seasons: ["autumn", "winter"], warmth: 4 });
    expect(suggestDefaults("outerwear", " giacca di pelle")).toMatchObject({ seasons: ["spring", "autumn"], warmth: 3 });
    expect(suggestDefaults("bottom", " pantaloni della tuta").styles).toEqual(["sportivo"]);
    expect(suggestDefaults("dress", " tuta intera").styles).toEqual(["elegante"]);
  });

  it("resta sempre correggibile: è un punto di partenza, non un vincolo", () => {
    const suggestion = suggestDefaults("dress", "Vestito qualsiasi");
    expect(suggestion).not.toBeNull();
  });
});

describe("filtri del guardaroba", () => {
  const items = [
    item({ id: "a", category: "top", colors: ["nero"], seasons: ["summer"], favorite: true, status: "clean" }),
    item({ id: "b", category: "shoes", colors: ["bianco"], seasons: ["winter"], status: "to_wash" }),
    item({ id: "c", category: "top", colors: ["nero", "bianco"], seasons: ["winter"], deleted_at: "2026-10-02T00:00:00.000Z" }),
  ];

  it("esclude i capi eliminati", () => {
    expect(filterWardrobe(items, {}).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("applica più filtri insieme", () => {
    expect(filterWardrobe(items, { categories: ["top"], colors: ["nero"] }).map((i) => i.id)).toEqual(["a"]);
    expect(filterWardrobe(items, { statuses: ["to_wash"] }).map((i) => i.id)).toEqual(["b"]);
    expect(filterWardrobe(items, { favoriteOnly: true }).map((i) => i.id)).toEqual(["a"]);
  });

  it("cerca nel nome, nella marca e nella sottocategoria", () => {
    const named = [item({ id: "x", name: "Stivaletti dorati", brand: "Zara" })];
    expect(filterWardrobe(named, { text: "zara" }).map((i) => i.id)).toEqual(["x"]);
    expect(filterWardrobe(named, { text: "gucci" })).toEqual([]);
  });

  it("elenca i valori presenti, non tutti quelli possibili", () => {
    expect(distinctValues(items, (i) => i.colors)).toEqual(["bianco", "nero"]);
  });

  it("propone un nome per la copia", () => {
    expect(duplicateName("Maglia nera")).toBe("Maglia nera (copia)");
    expect(duplicateName(null)).toBeNull();
  });
});

describe("ridimensionamento foto", () => {
  it("non tocca un'immagine già dentro il limite", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scala il lato più lungo al massimo consentito", () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 });
  });
});
