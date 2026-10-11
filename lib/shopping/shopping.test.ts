import { describe, expect, it } from "vitest";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { normalizeName, parseEntry } from "./entry";
import { recognizeProduct } from "./catalog";
import {
  departmentOf,
  frequentProducts,
  groupItems,
  learnedDepartment,
  recentProducts,
  suggestProducts,
  suggestionScore,
  usageLabel,
} from "./list";
import { inPantry, pantryCount, pantryGroups } from "./pantry";

let seq = 0;
function item(name: string, over: Partial<ShoppingItem> = {}): ShoppingItem {
  seq += 1;
  return {
    id: `i${String(seq).padStart(3, "0")}`,
    list_id: "l",
    name,
    quantity: null,
    department: null,
    checked: false,
    checked_at: null,
    finished_at: null,
    deleted_at: null,
    created_at: `2026-10-10T08:00:${String(seq % 60).padStart(2, "0")}Z`,
    ...over,
  };
}

function product(display_name: string, use_count: number, last_used_at: string | null, department: string | null = null): ProductMemory {
  return { id: display_name, display_name, department, use_count, last_used_at };
}

const NOW = new Date("2026-10-10T10:00:00Z");

describe("normalizeName", () => {
  it("toglie maiuscole, accenti e spazi in più", () => {
    expect(normalizeName("  Caffè   d'Orzo ")).toBe("caffe d'orzo");
  });
});

describe("parseEntry", () => {
  it.each([
    ["tofu", "tofu", null],
    ["  latte  di soia ", "latte di soia", null],
    ["2 latte", "latte", "2"],
    ["latte x2", "latte", "2"],
    ["latte 2x", "latte", "2"],
    ["500 g farina", "farina", "500 g"],
    ["500g farina", "farina", "500 g"],
    ["1,5 kg di patate", "patate", "1,5 kg"],
    ["1 kg d'uva", "uva", "1 kg"],
    ["2 kg dischi di cotone", "dischi di cotone", "2 kg"],
    ["acqua 1,5 l", "acqua", "1,5 l"],
    ["3 gamberi", "gamberi", "3"],
    ["2 limoni", "limoni", "2"],
    ["farina 00", "farina 00", null],
    ["7up", "7up", null],
    ["omega 3", "omega 3", null],
  ])("%s", (text, name, quantity) => {
    expect(parseEntry(text)).toEqual({ name, quantity });
  });
});

describe("recognizeProduct", () => {
  it.each([
    ["Zucchine", "Frutta e verdura", "salad"],
    ["limoni", "Frutta e verdura", "citrus"],
    ["Latte di soia", "Frigo", "milk"],
    ["yogurt alla fragola", "Frigo", "milk"],
    ["Tofu affumicato", "Frigo", "vegan"],
    ["petto di pollo", "Frigo", "poultry"],
    ["pane integrale", "Pane e forno", "wheat"],
    ["Lenticchie rosse", "Dispensa", "bean"],
    ["cioccolato al latte", "Dispensa", "candy"],
    ["Fiocchi d'avena", "Dispensa", "wheat"],
    ["fiocchi di latte", "Frigo", "milk"],
    ["burro di arachidi", "Dispensa", "nut"],
    ["passata di pomodoro", "Dispensa", "bottle"],
    ["patatine", "Dispensa", "popcorn"],
    ["caffè", "Dispensa", "coffee"],
    ["gelato al pistacchio", "Surgelati", "icecream"],
    ["spinaci surgelati", "Surgelati", "leafy"],
    ["acqua frizzante", "Bevande", "water"],
    ["aranciata", "Bevande", "soda"],
    ["succo di mela", "Bevande", "soda"],
    ["Detersivo lavatrice", "Casa", "spray"],
    ["detersivo piatti", "Casa", "bubbles"],
    ["carta igienica", "Casa", "paper"],
    ["latte detergente", "Cura della persona", "sparkles"],
    ["acqua micellare", "Cura della persona", "sparkles"],
    ["dentifricio", "Cura della persona", "toothbrush"],
    ["sale", "Dispensa", null],
  ])("%s", (name, department, icon) => {
    expect(recognizeProduct(name)).toEqual({ department, icon });
  });

  it("non inventa un reparto per ciò che non conosce", () => {
    expect(recognizeProduct("misterioso")).toBeNull();
    expect(recognizeProduct("pannello")).toBeNull();
    expect(recognizeProduct("")).toBeNull();
  });
});

describe("groupItems", () => {
  it("il reparto scelto o imparato vince su quello riconosciuto dal nome", () => {
    expect(departmentOf("latte", null)).toBe("Frigo");
    expect(departmentOf("latte", "Bevande")).toBe("Bevande");
    expect(departmentOf("misterioso", null)).toBeNull();
    const { groups } = groupItems([item("mele"), item("latte", { department: "Bevande" }), item("spugne")]);
    expect(groups.map((g) => [g.department, g.items.map((i) => i.name)])).toEqual([
      ["Frutta e verdura", ["mele"]],
      ["Bevande", ["latte"]],
      ["Casa", ["spugne"]],
    ]);
  });

  it("raggruppa per reparto nell'ordine previsto, con Altro in fondo", () => {
    const { groups } = groupItems([
      item("spugne", { department: "Casa" }),
      item("misterioso"),
      item("tofu", { department: "Frigo" }),
      item("mele", { department: "Frutta e verdura" }),
      item("crocchette", { department: "Animali" }),
      item("yogurt", { department: "Frigo" }),
    ]);
    expect(groups.map((g) => g.department)).toEqual(["Frutta e verdura", "Frigo", "Casa", "Animali", "Altro"]);
    expect(groups[1].items.map((i) => i.name)).toEqual(["tofu", "yogurt"]);
  });

  it("separa gli articoli presi, dal più recente", () => {
    const { groups, checked } = groupItems([
      item("pane", { checked: true, checked_at: "2026-10-10T09:00:00Z" }),
      item("latte"),
      item("uova", { checked: true, checked_at: "2026-10-10T09:05:00Z" }),
    ]);
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).toEqual(["latte"]);
    expect(checked.map((i) => i.name)).toEqual(["uova", "pane"]);
  });
});

describe("suggerimenti", () => {
  const memory = [
    product("latte di soia", 8, "2026-10-08T10:00:00Z", "Frigo"),
    product("latte di avena", 3, "2026-10-09T10:00:00Z", "Frigo"),
    product("latte di mandorla", 12, "2026-06-01T10:00:00Z"),
    product("cioccolato al latte", 20, "2026-10-09T10:00:00Z"),
    product("lattuga", 0, null),
    product("Lenticchie", 2, "2026-09-01T10:00:00Z", "Dispensa"),
  ];

  it("il punteggio somma frequenza e recenza", () => {
    expect(suggestionScore({ use_count: 8, last_used_at: "2026-10-08T10:00:00Z" }, NOW)).toBeCloseTo(8 + 28 / 3);
    expect(suggestionScore({ use_count: 12, last_used_at: "2026-06-01T10:00:00Z" }, NOW)).toBe(12);
    expect(suggestionScore({ use_count: 0, last_used_at: null }, NOW)).toBe(0);
  });

  it("propone prima i nomi che iniziano così, per frequenza e recenza", () => {
    expect(suggestProducts("lat", memory, [], NOW).map((p) => p.display_name)).toEqual([
      "latte di soia",
      "latte di avena",
      "latte di mandorla",
      "cioccolato al latte",
    ]);
  });

  it("ignora accenti e maiuscole, e ciò che è già in lista o già scritto per intero", () => {
    expect(suggestProducts("LENT", memory, [], NOW).map((p) => p.display_name)).toEqual(["Lenticchie"]);
    expect(suggestProducts("lent", memory, [item("lenticchie")], NOW)).toEqual([]);
    expect(suggestProducts("lenticchie", memory, [], NOW)).toEqual([]);
    expect(suggestProducts("  ", memory, [], NOW)).toEqual([]);
  });

  it("un articolo già preso può essere riproposto", () => {
    const taken = item("lenticchie", { checked: true, checked_at: "2026-10-10T09:00:00Z" });
    expect(suggestProducts("lent", memory, [taken], NOW)).toHaveLength(1);
  });

  it("lo storico elenca gli ultimi acquisti non in lista", () => {
    expect(recentProducts(memory, [item("Latte di avena")], 3).map((p) => p.display_name)).toEqual([
      "cioccolato al latte",
      "latte di soia",
      "Lenticchie",
    ]);
  });

  it("compri spesso: per punteggio, senza ciò che è in lista o mai comprato", () => {
    expect(frequentProducts(memory, [item("latte di soia")], NOW, 3).map((p) => p.display_name)).toEqual([
      "cioccolato al latte",
      "latte di avena",
      "latte di mandorla",
    ]);
  });

  it("descrive quanto e quando è stato comprato", () => {
    expect(usageLabel({ use_count: 8, last_used_at: "2026-10-08T10:00:00Z" }, NOW)).toBe("8 volte · 2 g fa");
    expect(usageLabel({ use_count: 1, last_used_at: "2026-10-09T09:00:00Z" }, NOW)).toBe("1 volta · ieri");
    expect(usageLabel({ use_count: 3, last_used_at: "2026-10-10T09:00:00Z" }, NOW)).toBe("3 volte · oggi");
    expect(usageLabel({ use_count: 2, last_used_at: null }, NOW)).toBe("2 volte");
  });

  it("ritrova il reparto imparato", () => {
    expect(learnedDepartment("LENTICCHIE", memory)).toBe("Dispensa");
    expect(learnedDepartment("lattuga", memory)).toBeNull();
    expect(learnedDepartment("mai visto", memory)).toBeNull();
  });
});

describe("in casa", () => {
  const bought = (name: string, over: Partial<ShoppingItem> = {}) => item(name, { checked: true, checked_at: "2026-10-10T09:00:00Z", ...over });

  it("è in casa ciò che è stato comprato e non è finito, anche se tolto dalla lista", () => {
    expect(inPantry(item("Latte"))).toBe(false);
    expect(inPantry(bought("Latte"))).toBe(true);
    expect(inPantry(bought("Latte", { deleted_at: "2026-10-10T10:00:00Z" }))).toBe(true);
    expect(inPantry(bought("Latte", { finished_at: "2026-10-11T10:00:00Z" }))).toBe(false);
  });

  it("raggruppa per reparto nell'ordine della spesa, in ordine alfabetico", () => {
    const groups = pantryGroups([bought("Zucchine"), bought("Qualcosa di strano"), bought("Latte"), bought("Carote"), item("Pane")]);
    expect(groups.map((g) => [g.department, g.entries.map((e) => e.name)])).toEqual([
      ["Frutta e verdura", ["Carote", "Zucchine"]],
      ["Frigo", ["Latte"]],
      ["Altro", ["Qualcosa di strano"]],
    ]);
    expect(pantryCount(groups)).toBe(4);
  });

  it("due acquisti dello stesso prodotto sono una voce sola, con i dati del più recente", () => {
    const old = bought("latte", { quantity: "1" });
    const recent = bought("Latte ", { quantity: "2", checked_at: "2026-10-11T09:00:00Z" });
    const [group] = pantryGroups([recent, old, bought("Latte", { finished_at: "2026-10-11T12:00:00Z" })]);
    expect(group.entries).toHaveLength(1);
    expect(group.entries[0]).toMatchObject({ name: "Latte", quantity: "2" });
    expect(group.entries[0].items.map((i) => i.id).sort()).toEqual([old.id, recent.id].sort());
  });
});
