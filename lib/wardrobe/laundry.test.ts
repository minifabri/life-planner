import { describe, expect, it } from "vitest";
import type { LaundryLoad, OutfitPlan, Task, WardrobeItem } from "../supabase/types";
import type { DayForecast } from "../weather/forecast";
import {
  DEFAULT_LOAD,
  autoWashGroup,
  dryingNote,
  isSnoozed,
  laundryGroupOfTask,
  laundryOverview,
  laundryTaskTitle,
  loadCandidates,
  loadSize,
  plannedLaundry,
  washGroupOf,
} from "./laundry";

const TODAY = "2026-10-18";

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
    wash_group: null,
    favorite: false,
    notes: null,
    wishlist_item_id: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: null,
    date: null,
    time: null,
    duration_min: null,
    due_date: null,
    window_start: null,
    attention: "low",
    remind: false,
    area_id: null,
    status: "open",
    completed_at: null,
    original_date: null,
    recurrence_id: null,
    source: "manual",
    meal_plan_id: null,
    event_id: null,
    shopping_item_id: null,
    laundry_group: null,
    is_private: false,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function load(group: LaundryLoad["wash_group"], count: number, washedOn: string): LaundryLoad {
  return { id: `${group}-${washedOn}`, wash_group: group, washed_on: washedOn, item_ids: Array.from({ length: count }, (_, i) => `x${i}`), task_id: null, created_at: `${washedOn}T10:00:00Z` };
}

const dirty = (id: string, colors: string[], patch: Partial<WardrobeItem> = {}) => item(id, { status: "to_wash", colors, ...patch });

describe("autoWashGroup", () => {
  it("ricava il gruppo dai colori", () => {
    expect(autoWashGroup(item("a", { colors: ["nero"] }))).toBe("dark");
    expect(autoWashGroup(item("a", { colors: ["bianco"] }))).toBe("light");
    expect(autoWashGroup(item("a", { colors: ["rosso"] }))).toBe("colored");
  });

  it("con più colori sceglie il più rischioso", () => {
    expect(autoWashGroup(item("a", { colors: ["bianco", "nero"] }))).toBe("dark");
    expect(autoWashGroup(item("a", { colors: ["bianco", "rosa"] }))).toBe("colored");
  });

  it("il materiale delicato vince sul colore", () => {
    expect(autoWashGroup(item("a", { colors: ["nero"], material: "Lana merino" }))).toBe("delicate");
    expect(autoWashGroup(item("a", { colors: ["bianco"], name: "Top in pizzo" }))).toBe("delicate");
    // "Lanadi" non è lana: si cercano parole intere.
    expect(autoWashGroup(item("a", { colors: ["bianco"], material: "lanadi" }))).toBe("light");
  });

  it("senza indizi non azzarda", () => {
    expect(autoWashGroup(item("a", { colors: [] }))).toBeNull();
    expect(autoWashGroup(item("a", { colors: ["oro", "altro"] }))).toBeNull();
  });

  it("il gruppo scelto a mano vince", () => {
    expect(washGroupOf(item("a", { colors: ["nero"], wash_group: "light" }))).toBe("light");
  });
});

describe("laundryGroupOfTask", () => {
  it("riconosce le attività dell'app", () => {
    expect(laundryGroupOfTask(task("t", { source: "laundry", laundry_group: "dark", title: "Lavatrice scuri" }))).toBe("dark");
    expect(laundryGroupOfTask(task("t", { source: "laundry", laundry_group: null, title: "Lavatrice" }))).toBeNull();
  });

  it("riconosce le lavatrici scritte a mano", () => {
    expect(laundryGroupOfTask(task("t", { title: "Lavatrice scuri" }))).toBe("dark");
    expect(laundryGroupOfTask(task("t", { title: "fare il bucato dei bianchi" }))).toBe("light");
    expect(laundryGroupOfTask(task("t", { title: "Lavatrice colorati 30°" }))).toBe("colored");
    expect(laundryGroupOfTask(task("t", { title: "Lavaggio a mano maglioni" }))).toBe("delicate");
    expect(laundryGroupOfTask(task("t", { title: "Lavatrice" }))).toBeNull();
    expect(laundryGroupOfTask(task("t", { title: "Comprare detersivo" }))).toBeUndefined();
  });

  it("il titolo dell'app si riconosce anche come testo", () => {
    for (const g of ["dark", "light", "colored", "delicate"] as const) expect(laundryGroupOfTask(task("t", { title: laundryTaskTitle(g) }))).toBe(g);
  });
});

describe("loadSize", () => {
  it("parte dal valore predefinito", () => {
    expect(loadSize("dark", [])).toBe(DEFAULT_LOAD.dark);
    expect(loadSize("dark", [load("dark", 9, "2026-10-01")])).toBe(DEFAULT_LOAD.dark);
  });

  it("impara dalle ultime lavatrici del gruppo", () => {
    const loads = [load("dark", 8, "2026-10-01"), load("dark", 10, "2026-10-05"), load("dark", 9, "2026-10-10"), load("light", 2, "2026-10-11")];
    expect(loadSize("dark", loads)).toBe(9);
    expect(loadSize("dark", [load("dark", 1, "2026-10-01"), load("dark", 1, "2026-10-02")])).toBe(3);
  });
});

describe("laundryOverview", () => {
  it("conta i capi da lavare per gruppo, senza scarpe e borse", () => {
    const other = { category: "other" as const };
    const items = [dirty("a", ["nero"], other), dirty("b", ["blu"], other), dirty("c", ["bianco"], other), dirty("d", [], other), dirty("s", ["nero"], { category: "shoes" }), item("e", { colors: ["nero"] })];
    const view = laundryOverview({ items, plans: [], outfits: [], loads: [], today: TODAY });
    expect(view.counts).toEqual([
      { group: "dark", count: 2 },
      { group: "light", count: 1 },
    ]);
    expect(view.ungrouped.map((i) => i.id)).toEqual(["d"]);
    expect(view.proposals).toEqual([]);
  });

  it("propone la lavatrice con un carico pieno", () => {
    const items = Array.from({ length: 6 }, (_, i) => dirty(`d${i}`, ["nero"], { category: "other" }));
    const [p] = laundryOverview({ items, plans: [], outfits: [], loads: [], today: TODAY }).proposals;
    expect(p.group).toBe("dark");
    expect(p.reasons).toEqual(["6 capi: un carico pieno"]);
    expect(p.urgent).toBe(false);
  });

  it("un capo in programma rende urgente la lavatrice, con la scadenza il giorno prima", () => {
    const items = [dirty("maglia", ["bianco"], { name: "Maglia bianca" }), dirty("x", ["nero"])];
    const plans: OutfitPlan[] = [{ id: "p", date: "2026-10-22", event_id: null, label: null, outfit_id: null, item_ids: ["maglia"], created_at: "2026-10-17T08:00:00Z" }];
    const [p] = laundryOverview({ items, plans, outfits: [], loads: [], today: TODAY }).proposals;
    expect(p.group).toBe("light");
    expect(p.urgent).toBe(true);
    expect(p.deadline).toBe("2026-10-21");
    expect(p.reasons[0]).toBe("Serve giovedì: Maglia bianca");
  });

  it("un outfit di oggi ha la scadenza oggi; uno troppo lontano non conta", () => {
    const items = [dirty("a", ["bianco"])];
    const plan = (date: string): OutfitPlan => ({ id: date, date, event_id: null, label: null, outfit_id: null, item_ids: ["a"], created_at: "2026-10-17T08:00:00Z" });
    expect(laundryOverview({ items, plans: [plan(TODAY)], outfits: [], loads: [], today: TODAY }).proposals[0].deadline).toBe(TODAY);
    expect(laundryOverview({ items, plans: [plan("2026-10-30")], outfits: [], loads: [], today: TODAY }).proposals).toEqual([]);
  });

  it("segnala i top puliti in esaurimento", () => {
    const items = [dirty("a", ["nero"]), dirty("b", ["nero"]), item("c"), item("d"), item("p", { category: "bottom" })];
    const [p] = laundryOverview({ items, plans: [], outfits: [], loads: [], today: TODAY }).proposals;
    expect(p.reasons).toEqual(["Restano 2 top puliti"]);
  });

  it("con pochi capi in quella categoria non parla di scorte", () => {
    const items = [dirty("a", ["nero"]), item("c")];
    expect(laundryOverview({ items, plans: [], outfits: [], loads: [], today: TODAY }).proposals).toEqual([]);
  });

  it("prima le urgenti, poi i gruppi più pieni", () => {
    const items = [
      ...Array.from({ length: 8 }, (_, i) => dirty(`d${i}`, ["nero"])),
      ...Array.from({ length: 6 }, (_, i) => dirty(`c${i}`, ["rosso"], { category: "bottom" })),
      dirty("w", ["bianco"], { category: "dress" }),
    ];
    const plans: OutfitPlan[] = [{ id: "p", date: "2026-10-19", event_id: null, label: null, outfit_id: null, item_ids: ["w"], created_at: "2026-10-17T08:00:00Z" }];
    const groups = laundryOverview({ items, plans, outfits: [], loads: [], today: TODAY }).proposals.map((p) => p.group);
    expect(groups).toEqual(["light", "dark", "colored"]);
  });
});

describe("isSnoozed", () => {
  it("torna quando si aggiungono capi, e non nasconde le urgenti", () => {
    const p = { group: "dark" as const, items: [item("a"), item("b")], urgent: false };
    expect(isSnoozed(p, {})).toBe(false);
    expect(isSnoozed(p, { dark: 2 })).toBe(true);
    expect(isSnoozed({ ...p, items: [...p.items, item("c")] }, { dark: 2 })).toBe(false);
    expect(isSnoozed({ ...p, urgent: true }, { dark: 2 })).toBe(false);
  });
});

describe("plannedLaundry", () => {
  it("trova la prossima lavatrice aperta del gruppo, anche scritta a mano", () => {
    const tasks = [
      task("a", { title: "Lavatrice scuri", date: "2026-10-25" }),
      task("b", { source: "laundry", laundry_group: "dark", title: "Lavatrice scuri", date: "2026-10-20" }),
      task("c", { title: "Lavatrice scuri", date: "2026-10-19", status: "done" }),
      task("d", { title: "Lavatrice chiari", date: "2026-10-19" }),
    ];
    expect(plannedLaundry(tasks, "dark")?.id).toBe("b");
    expect(plannedLaundry(tasks, "delicate")).toBeNull();
  });
});

describe("dryingNote", () => {
  const day = (date: string, rain: number | null): DayForecast => ({ date, min: 10, max: 18, feelsMin: 10, feelsMax: 18, rain, code: null });

  it("consiglia oggi se domani piove, e avvisa se piove oggi", () => {
    expect(dryingNote([day(TODAY, 10), day("2026-10-19", 80)], TODAY)).toBe("Domani pioggia probabile: per stendere, meglio oggi");
    expect(dryingNote([day(TODAY, 70), day("2026-10-19", 10)], TODAY)).toMatch(/^Oggi pioggia probabile/);
    expect(dryingNote([day(TODAY, 10), day("2026-10-19", 10)], TODAY)).toBeNull();
    expect(dryingNote(null, TODAY)).toBeNull();
  });
});

describe("loadCandidates", () => {
  it("sceglie i capi da lavare del gruppo e offre quelli indossati", () => {
    const items = [dirty("a", ["nero"]), item("b", { colors: ["nero"], status: "worn" }), item("c", { colors: ["nero"] }), dirty("d", ["bianco"]), dirty("s", ["nero"], { category: "shoes" })];
    const { selected, optional } = loadCandidates(items, "dark");
    expect(selected.map((i) => i.id)).toEqual(["a"]);
    expect(optional.map((i) => i.id)).toEqual(["b"]);
  });

  it("senza gruppo mostra tutti i capi da lavare, nessuno già scelto", () => {
    const items = [dirty("a", ["nero"]), dirty("d", ["bianco"])];
    expect(loadCandidates(items, null)).toEqual({ selected: [], optional: items });
  });
});
