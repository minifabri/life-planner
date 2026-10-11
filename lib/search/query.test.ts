import { describe, expect, it } from "vitest";
import { groupResults, isSearchable, matchCommands, normalize, parseSearchQuery, resultMeta, resultTarget, type SearchResult } from "./query";

const TODAY = "2026-10-10";

function result(patch: Partial<SearchResult>): SearchResult {
  return { kind: "task", id: "1", title: "Titolo", detail: null, date: null, time: null, done: false, score: 0.5, ...patch };
}

describe("parseSearchQuery", () => {
  it("senza periodo lascia il testo com'è, ripulito dagli spazi", () => {
    expect(parseSearchQuery("  lent  icchie ", TODAY)).toEqual({ text: "lent icchie", from: null, to: null, period: null });
  });

  it("un mese vale per l'anno in corso", () => {
    expect(parseSearchQuery("unghie ottobre", TODAY)).toEqual({ text: "unghie", from: "2026-10-01", to: "2026-10-31", period: "ottobre 2026" });
    expect(parseSearchQuery("Febbraio dentista", TODAY)).toMatchObject({ text: "dentista", from: "2026-02-01", to: "2026-02-28" });
  });

  it("mese con anno, anche con le preposizioni", () => {
    expect(parseSearchQuery("parrucchiere a settembre 2025", TODAY)).toEqual({
      text: "parrucchiere",
      from: "2025-09-01",
      to: "2025-09-30",
      period: "settembre 2025",
    });
    expect(parseSearchQuery("ceretta di marzo del 2024", TODAY)).toMatchObject({ text: "ceretta", from: "2024-03-01", to: "2024-03-31" });
  });

  it("un anno da solo copre tutto l'anno", () => {
    expect(parseSearchQuery("assicurazione 2025", TODAY)).toEqual({ text: "assicurazione", from: "2025-01-01", to: "2025-12-31", period: "2025" });
  });

  it("solo il periodo: testo vuoto ma si può cercare", () => {
    const q = parseSearchQuery("ottobre", TODAY);
    expect(q).toMatchObject({ text: "", from: "2026-10-01" });
    expect(isSearchable(q)).toBe(true);
  });

  it("non scambia per mese una parola che lo contiene", () => {
    expect(parseSearchQuery("marzolino", TODAY).period).toBeNull();
    expect(parseSearchQuery("codice 20261", TODAY).period).toBeNull();
  });

  it("una lettera sola non basta per cercare", () => {
    expect(isSearchable(parseSearchQuery("a", TODAY))).toBe(false);
    expect(isSearchable(parseSearchQuery("ab", TODAY))).toBe(true);
  });
});

describe("matchCommands", () => {
  it("senza testo li propone tutti", () => {
    expect(matchCommands("").length).toBeGreaterThan(5);
  });

  it("trova per etichetta e per parole chiave, senza badare ad accenti e maiuscole", () => {
    expect(matchCommands("spesa").map((c) => c.id)).toEqual(["shopping"]);
    expect(matchCommands("CALEND").map((c) => c.id)).toEqual(["week", "month"]);
    expect(matchCommands("tema").map((c) => c.id)).toEqual(["settings", "theme"]);
    expect(matchCommands("vai log").map((c) => c.id)).toEqual(["log"]);
  });

  it("non propone comandi per una ricerca qualsiasi", () => {
    expect(matchCommands("lenticchie")).toEqual([]);
  });

  it("normalize toglie accenti e spazi doppi", () => {
    expect(normalize("  Caffè   Però ")).toBe("caffe pero");
  });
});

describe("risultati", () => {
  it("raggruppa per tipo, prima il gruppo con la corrispondenza migliore", () => {
    const groups = groupResults([
      result({ id: "a", kind: "shopping", score: 0.4 }),
      result({ id: "b", kind: "log", score: 0.9 }),
      result({ id: "c", kind: "shopping", score: 0.6 }),
    ]);
    expect(groups.map((g) => [g.kind, g.items.map((i) => i.id)])).toEqual([
      ["log", ["b"]],
      ["shopping", ["a", "c"]],
    ]);
  });

  it("descrive data, ora, stato e dettaglio", () => {
    expect(resultMeta(result({ date: "2026-10-11", time: "15:00:00" }), TODAY)).toBe("domani · 15:00");
    expect(resultMeta(result({ date: "2026-09-12", done: true }), TODAY)).toBe("fatta · 12 set");
    expect(resultMeta(result({ kind: "log", date: "2025-09-12", detail: "Unghie" }), TODAY)).toBe("12 set 2025 · Unghie");
    expect(resultMeta(result({ kind: "shopping", done: true }), TODAY)).toBe("presa");
    expect(resultMeta(result({}), TODAY)).toBe("");
  });

  it("porta al giorno per attività ed eventi con una data, alla sezione per il resto", () => {
    expect(resultTarget(result({ kind: "event", date: "2026-11-02" }))).toEqual({ href: "/today", day: "2026-11-02" });
    expect(resultTarget(result({ kind: "task" }))).toEqual({ href: "/today" });
    expect(resultTarget(result({ kind: "log" }))).toEqual({ href: "/log" });
    expect(resultTarget(result({ kind: "meal" }))).toEqual({ href: "/lists/meals" });
  });
});
