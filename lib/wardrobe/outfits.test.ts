import { describe, expect, it } from "vitest";
import { commonTags, filterOutfits, orderForBoard, replaceItem, resolveItems, statusAfterWear, suggestOutfitTags, toWashCount, toggleItem, wearsOf } from "./outfits";
import type { Outfit, WardrobeItem, WardrobeWear } from "../supabase/types";

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
    deleted_at: null,
    created_at: "2026-10-12T08:00:00Z",
    updated_at: "2026-10-12T08:00:00Z",
    ...patch,
  };
}

function outfit(patch: Partial<Outfit>): Outfit {
  return {
    id: "o1",
    name: null,
    item_ids: [],
    styles: [],
    occasions: [],
    seasons: [],
    favorite: false,
    notes: null,
    deleted_at: null,
    created_at: "2026-10-12T08:00:00Z",
    updated_at: "2026-10-12T08:00:00Z",
    ...patch,
  };
}

describe("orderForBoard", () => {
  it("mette capospalla e top prima di scarpe e accessori", () => {
    const ordered = orderForBoard([
      item({ id: "s", category: "shoes" }),
      item({ id: "a", category: "accessory" }),
      item({ id: "t", category: "top" }),
      item({ id: "o", category: "outerwear" }),
      item({ id: "b", category: "bottom" }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(["o", "t", "b", "s", "a"]);
  });

  it("a parità di categoria mantiene l'ordine di inserimento (strati)", () => {
    const ordered = orderForBoard([item({ id: "t2" }), item({ id: "t1" })]);
    expect(ordered.map((i) => i.id)).toEqual(["t2", "t1"]);
  });
});

describe("resolveItems", () => {
  it("conta i capi che non ci sono più senza farli sparire dal conteggio", () => {
    const items = [item({ id: "a" }), item({ id: "b", deleted_at: "2026-10-12T09:00:00Z" })];
    const resolved = resolveItems(["a", "b", "c"], items);
    expect(resolved.items.map((i) => i.id)).toEqual(["a"]);
    expect(resolved.missing).toBe(2);
  });
});

describe("replaceItem e toggleItem", () => {
  it("sostituisce mantenendo la posizione", () => {
    expect(replaceItem(["a", "b", "c"], "b", "x")).toEqual(["a", "x", "c"]);
  });

  it("non duplica un capo già presente", () => {
    expect(replaceItem(["a", "b", "c"], "b", "c")).toEqual(["a", "c"]);
  });

  it("aggiunge e toglie", () => {
    expect(toggleItem(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleItem(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("commonTags", () => {
  it("propone le etichette condivise da almeno metà dei capi che ne hanno", () => {
    expect(commonTags([["minimal", "gothic"], ["minimal"], ["urban"], []])).toEqual(["minimal"]);
  });

  it("ignora i capi senza etichette", () => {
    expect(commonTags([["serata"], [], []])).toEqual(["serata"]);
  });

  it("senza etichette non propone nulla", () => {
    expect(commonTags([[], []])).toEqual([]);
  });

  it("ricava stili, occasioni e stagioni dai capi", () => {
    const tags = suggestOutfitTags([
      item({ styles: ["gothic"], occasions: ["serata"], seasons: ["autumn", "winter"] }),
      item({ styles: ["gothic", "elegante"], occasions: ["serata", "aperitivo"], seasons: ["autumn"] }),
    ]);
    expect(tags).toEqual({ styles: ["gothic", "elegante"], occasions: ["serata", "aperitivo"], seasons: ["autumn", "winter"] });
  });
});

describe("stato dopo l'utilizzo", () => {
  it("un top indossato diventa riutilizzabile, non da lavare", () => {
    expect(statusAfterWear(item({ category: "top", status: "clean" }))).toBe("worn");
  });

  it("scarpe, borse, accessori e capispalla restano come sono", () => {
    expect(statusAfterWear(item({ category: "shoes", status: "clean" }))).toBe("clean");
    expect(statusAfterWear(item({ category: "outerwear", status: "worn" }))).toBe("worn");
  });

  it("un capo da lavare resta da lavare", () => {
    expect(statusAfterWear(item({ category: "top", status: "to_wash" }))).toBe("to_wash");
  });

  it("conta i capi da lavare", () => {
    expect(toWashCount([item({ status: "to_wash" }), item({ status: "worn" })])).toBe(1);
  });
});

describe("wearsOf", () => {
  it("restituisce gli utilizzi dell'outfit dal più recente", () => {
    const wears: WardrobeWear[] = [
      { id: "w1", worn_on: "2026-10-01", outfit_id: "o1", item_ids: [], created_at: "" },
      { id: "w2", worn_on: "2026-10-10", outfit_id: "o1", item_ids: [], created_at: "" },
      { id: "w3", worn_on: "2026-10-11", outfit_id: "o2", item_ids: [], created_at: "" },
    ];
    expect(wearsOf(wears, "o1").map((w) => w.id)).toEqual(["w2", "w1"]);
  });
});

describe("filterOutfits", () => {
  const outfits = [
    outfit({ id: "a", name: "Cena fuori", created_at: "2026-10-01T08:00:00Z" }),
    outfit({ id: "b", name: "Ufficio", styles: ["minimal"], created_at: "2026-10-02T08:00:00Z" }),
    outfit({ id: "c", name: "Preferito", favorite: true, created_at: "2026-09-01T08:00:00Z" }),
    outfit({ id: "d", name: "Eliminato", deleted_at: "2026-10-03T08:00:00Z" }),
  ];

  it("mette i preferiti prima, poi i più recenti, senza gli eliminati", () => {
    expect(filterOutfits(outfits, "").map((o) => o.id)).toEqual(["c", "b", "a"]);
  });

  it("cerca nel nome e nelle etichette", () => {
    expect(filterOutfits(outfits, "MINIMAL").map((o) => o.id)).toEqual(["b"]);
    expect(filterOutfits(outfits, "cena").map((o) => o.id)).toEqual(["a"]);
  });
});
