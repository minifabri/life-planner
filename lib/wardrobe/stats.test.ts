import { describe, expect, it } from "vitest";
import { itemUsage, outfitUsage, timesLabel, wardrobeStats } from "./stats";
import type { Outfit, WardrobeItem, WardrobeWear } from "../supabase/types";

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
    created_at: "2026-06-01T08:00:00Z",
    updated_at: "2026-06-01T08:00:00Z",
    ...patch,
  };
}

function outfit(id: string, itemIds: string[], patch: Partial<Outfit> = {}): Outfit {
  return { id, name: id, item_ids: itemIds, styles: [], occasions: [], seasons: [], favorite: false, notes: null, deleted_at: null, created_at: "2026-06-01T08:00:00Z", updated_at: "2026-06-01T08:00:00Z", ...patch };
}

function wear(wornOn: string, itemIds: string[], outfitId: string | null = null): WardrobeWear {
  return { id: `${wornOn}-${itemIds.join("-")}`, worn_on: wornOn, outfit_id: outfitId, item_ids: itemIds, created_at: `${wornOn}T08:00:00Z` };
}

const today = "2026-10-12";
const items = [
  item("a"),
  item("b"),
  item("c", { created_at: "2026-05-01T08:00:00Z" }),
  item("d", { created_at: "2026-04-01T08:00:00Z" }),
  item("solo"),
  item("eliminato", { deleted_at: "2026-09-01T08:00:00Z" }),
];
const outfits = [outfit("o1", ["a", "b"]), outfit("o2", ["a", "c"]), outfit("via", ["a", "d"], { deleted_at: "2026-09-01T08:00:00Z" })];
const wears = [wear("2026-07-01", ["a", "b"], "o1"), wear("2026-10-10", ["a", "b"], "o1"), wear("2026-07-15", ["c", "a"], "o2"), wear("2026-10-01", ["solo"])];

describe("utilizzi", () => {
  it("conta le volte e ricorda l'ultima", () => {
    expect(itemUsage(wears).get("a")).toEqual({ count: 3, last: "2026-10-10" });
    expect(itemUsage(wears).get("c")).toEqual({ count: 1, last: "2026-07-15" });
    expect(outfitUsage(wears).get("o1")).toEqual({ count: 2, last: "2026-10-10" });
  });

  it("un capo ripetuto nello stesso utilizzo conta una volta", () => {
    expect(itemUsage([wear("2026-10-01", ["a", "a"])]).get("a")?.count).toBe(1);
  });
});

describe("wardrobeStats", () => {
  const stats = wardrobeStats(items, outfits, wears, today);

  it("conta capi e outfit non eliminati, e dice da quando ci sono dati", () => {
    expect(stats.items).toBe(5);
    expect(stats.outfits).toBe(2);
    expect(stats.since).toBe("2026-07-01");
  });

  it("ordina i più indossati", () => {
    expect(stats.mostWorn.map((e) => [e.item.id, e.usage.count])).toEqual([
      ["a", 3],
      ["b", 2],
      ["solo", 1],
      ["c", 1],
    ]);
  });

  it("conta i capi indossati negli ultimi 30 giorni", () => {
    expect(stats.wornRecently).toBe(3);
  });

  it("elenca i mai indossati dal più vecchio, senza gli eliminati", () => {
    expect(stats.neverWorn.map((i) => i.id)).toEqual(["d"]);
  });

  it("elenca i capi fermi da almeno 60 giorni", () => {
    expect(stats.forgotten.map((e) => e.item.id)).toEqual(["c"]);
  });

  it("i capi mai abbinati non stanno in outfit salvati né in utilizzi con altri capi", () => {
    expect(stats.unpaired.map((i) => i.id)).toEqual(["d", "solo"]);
  });

  it("ordina gli outfit più indossati e ignora quelli mai indossati", () => {
    expect(stats.topOutfits.map((e) => [e.outfit.id, e.usage.count])).toEqual([
      ["o1", 2],
      ["o2", 1],
    ]);
  });

  it("senza storico non inventa nulla", () => {
    const empty = wardrobeStats(items, outfits, [], today);
    expect(empty.since).toBeNull();
    expect(empty.mostWorn).toEqual([]);
    expect(empty.wornRecently).toBe(0);
    expect(empty.neverWorn).toHaveLength(5);
  });
});

describe("timesLabel", () => {
  it("scrive il numero di volte", () => {
    expect(timesLabel(1)).toBe("una volta");
    expect(timesLabel(4)).toBe("4 volte");
  });
});
