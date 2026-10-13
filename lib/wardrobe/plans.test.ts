import { describe, expect, it } from "vitest";
import { planIssues, planTitle, plansForDay, resolvePlan, upcomingPlans, weatherIssue } from "./plans";
import type { Outfit, OutfitPlan, WardrobeItem } from "../supabase/types";

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
    wishlist_item_id: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function plan(id: string, patch: Partial<OutfitPlan> = {}): OutfitPlan {
  return { id, date: "2026-10-17", event_id: null, label: null, outfit_id: null, item_ids: [], created_at: `2026-10-12T08:00:0${id.length}Z`, ...patch };
}

const outfit: Outfit = {
  id: "o1",
  name: "Sera",
  item_ids: ["a", "b"],
  styles: [],
  occasions: [],
  seasons: [],
  favorite: false,
  notes: null,
  deleted_at: null,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
};

describe("upcomingPlans", () => {
  const plans = [plan("c", { date: "2026-10-20" }), plan("a", { date: "2026-10-11" }), plan("b", { date: "2026-10-12" })];

  it("tiene da oggi in avanti, dal giorno più vicino", () => {
    expect(upcomingPlans(plans, "2026-10-12").map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("trova le pianificazioni di un giorno", () => {
    expect(plansForDay(plans, "2026-10-20").map((p) => p.id)).toEqual(["c"]);
    expect(plansForDay(plans, "2026-10-13")).toEqual([]);
  });
});

describe("resolvePlan", () => {
  const items = [item("a"), item("b"), item("c")];

  it("usa i capi dell'outfit salvato finché esiste", () => {
    const resolved = resolvePlan(plan("p", { outfit_id: "o1", item_ids: ["c"] }), [outfit], items);
    expect(resolved.outfit?.id).toBe("o1");
    expect(resolved.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("se l'outfit è stato eliminato restano i capi fissati nella pianificazione", () => {
    const resolved = resolvePlan(plan("p", { outfit_id: "o1", item_ids: ["c"] }), [{ ...outfit, deleted_at: "2026-10-12T09:00:00Z" }], items);
    expect(resolved.outfit).toBeNull();
    expect(resolved.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("segnala i capi da lavare e quelli che non ci sono più, senza toglierli dalla scelta", () => {
    const resolved = resolvePlan(plan("p", { item_ids: ["a", "b", "x"] }), [], [item("a", { status: "to_wash" }), item("b")]);
    expect(resolved.itemIds).toEqual(["a", "b", "x"]);
    expect(planIssues(resolved)).toEqual(["Un capo è da lavare", "Un capo non è più nel guardaroba"]);
  });

  it("senza problemi non segnala nulla", () => {
    expect(planIssues(resolvePlan(plan("p", { item_ids: ["a"] }), [], items))).toEqual([]);
  });
});

describe("planTitle", () => {
  it("preferisce l'occasione, poi il nome dell'outfit, poi un nome generico", () => {
    expect(planTitle({ plan: plan("p", { label: "Cena fuori" }), outfit })).toBe("Cena fuori");
    expect(planTitle({ plan: plan("p"), outfit })).toBe("Sera");
    expect(planTitle({ plan: plan("p", { label: "  " }), outfit: null })).toBe("Outfit");
  });
});

describe("weatherIssue", () => {
  const forecast = (feels: number) => ({ date: "2026-10-17", min: feels, max: feels, feelsMin: feels, feelsMax: feels, rain: null, code: null });
  const light = [item("a", { warmth: 1 }), item("b", { category: "bottom", warmth: 2 })];
  const heavy = [item("a", { warmth: 5 }), item("b", { category: "bottom", warmth: 4 }), item("c", { category: "outerwear", warmth: 5 })];

  it("segnala un outfit leggero per il freddo e uno pesante per il caldo", () => {
    expect(weatherIssue(light, forecast(4))).toBe("Forse leggero per una giornata fredda");
    expect(weatherIssue(heavy, forecast(28))).toBe("Forse pesante per una giornata calda");
  });

  it("tace quando l'outfit è adatto", () => {
    expect(weatherIssue(light, forecast(28))).toBeNull();
    expect(weatherIssue(heavy, forecast(4))).toBeNull();
    expect(weatherIssue([item("a", { warmth: 3 }), item("b", { category: "bottom", warmth: 3 })], forecast(16))).toBeNull();
  });

  it("tace senza previsione o senza pesantezza dichiarata", () => {
    expect(weatherIssue(light, null)).toBeNull();
    expect(weatherIssue([item("a"), item("b", { category: "bottom" })], forecast(4))).toBeNull();
    // Scarpe e accessori non dicono quanto tiene caldo l'outfit.
    expect(weatherIssue([item("s", { category: "shoes", warmth: 1 })], forecast(4))).toBeNull();
  });
});
