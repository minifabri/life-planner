import { describe, expect, it } from "vitest";
import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { PRODUCE, isInSeason, produceIn, seasonalPicks } from "./seasonal";

const NOW = new Date("2026-10-16T08:00:00Z");
const OCT = "2026-10-16";

function item(name: string, checked = false): ShoppingItem {
  return {
    id: name,
    list_id: "l",
    name,
    quantity: null,
    department: null,
    checked,
    checked_at: null,
    finished_at: null,
    urgent: false,
    task_id: null,
    deleted_at: null,
    created_at: "2026-10-10T08:00:00Z",
  };
}

const product = (display_name: string, use_count: number, last_used_at: string | null = null): ProductMemory => ({ id: display_name, display_name, department: null, use_count, last_used_at });
const names = (list: { name: string }[]) => list.map((p) => p.name);

describe("produceIn", () => {
  it("riconosce frutta e verdura al singolare e al plurale", () => {
    expect(names(produceIn("Pera e mandorle"))).toEqual(["Pere"]);
    expect(names(produceIn("Pasta con zucchine e noci"))).toEqual(["Zucchine"]);
    expect(names(produceIn("2 kg di mele golden"))).toEqual(["Mele"]);
  });

  it("preferisce la frase più lunga e non conta due volte lo stesso prodotto", () => {
    expect(names(produceIn("Zuppa di ceci e cavolo nero con crostini"))).toEqual(["Cavolo nero"]);
    expect(names(produceIn("Tempeh, patate dolci e cavolo"))).toEqual(["Patate dolci", "Cavolo"]);
    expect(names(produceIn("Pomodori e pomodorini"))).toEqual(["Pomodori"]);
  });

  it("non considera i prodotti di tutto l'anno né il sugo al pomodoro", () => {
    expect(produceIn("Patate, carote e cipolle")).toEqual([]);
    expect(produceIn("Pasta integrale al pomodoro e lenticchie")).toEqual([]);
    expect(produceIn("Melanzane")).not.toEqual(produceIn("Mele"));
  });
});

describe("isInSeason", () => {
  it("segue il mese", () => {
    const zucca = PRODUCE.find((p) => p.name === "Zucca")!;
    expect(isInSeason(zucca, OCT)).toBe(true);
    expect(isInSeason(zucca, "2026-01-10")).toBe(true);
    expect(isInSeason(zucca, "2026-07-10")).toBe(false);
  });

  it("ogni mese ha qualcosa di stagione, frutta e verdura", () => {
    for (let m = 1; m <= 12; m++) {
      const inMonth = PRODUCE.filter((p) => p.months.includes(m));
      expect(inMonth.some((p) => p.kind === "fruit")).toBe(true);
      expect(inMonth.some((p) => p.kind === "vegetable")).toBe(true);
    }
  });
});

describe("seasonalPicks", () => {
  it("propone solo ciò che è di stagione e non è già in lista", () => {
    const picks = names(seasonalPicks(OCT, [], [item("zucca"), item("uva", true)], NOW));
    expect(picks).not.toContain("Zucca");
    expect(picks).toContain("Uva");
    expect(picks).toContain("Cachi");
    expect(picks).not.toContain("Fragole");
    expect(picks).not.toContain("Pomodori");
  });

  it("mette prima ciò che compri già, con il tuo nome", () => {
    const memory = [product("Fragole", 9), product("Mele golden", 2), product("Cavolfiore", 5), product("Pere", 0)];
    const picks = seasonalPicks(OCT, memory, [], NOW);
    expect(picks.slice(0, 2)).toEqual([
      expect.objectContaining({ name: "Cavolfiore", known: true }),
      expect.objectContaining({ name: "Mele golden", known: true }),
    ]);
    expect(picks.filter((p) => p.produce.name === "Mele")).toHaveLength(1);
    expect(picks.find((p) => p.name === "Pere")?.known).toBe(false);
  });

  it("alterna verdura e frutta tra le proposte nuove", () => {
    const kinds = seasonalPicks(OCT, [], [], NOW)
      .slice(0, 4)
      .map((p) => p.produce.kind);
    expect(kinds).toEqual(["vegetable", "fruit", "vegetable", "fruit"]);
  });
});
