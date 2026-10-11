import { describe, expect, it } from "vitest";
import type { TemplateItem } from "../supabase/types";
import { applyTemplate, cleanItems, emptyItem, itemsFromTasks, offsetLabel, parseItems, templateSummary } from "./apply";

const item = (patch: Partial<TemplateItem>): TemplateItem => ({ ...emptyItem(), title: "Voce", ...patch });

describe("cleanItems", () => {
  it("toglie le righe vuote e gli spazi, e ordina per giorno e ora", () => {
    const out = cleanItems([
      item({ title: "  Stampare la sequenza ", day_offset: 2 }),
      item({ title: "   " }),
      item({ title: "Senza ora", day_offset: 0 }),
      item({ title: "Alle nove", day_offset: 0, time: "09:00:00" }),
    ]);
    expect(out.map((i) => [i.title, i.day_offset, i.time])).toEqual([
      ["Alle nove", 0, "09:00"],
      ["Senza ora", 0, null],
      ["Stampare la sequenza", 2, null],
    ]);
  });

  it("riporta i valori dentro i limiti", () => {
    const [out] = cleanItems([item({ day_offset: -3, duration_min: 0, time: "boh", area_id: "", attention: "urgente" as never })]);
    expect(out).toMatchObject({ day_offset: 0, duration_min: null, time: null, area_id: null, attention: "low" });
    expect(cleanItems([item({ day_offset: 9999 })])[0].day_offset).toBe(365);
    expect(cleanItems([item({ day_offset: 1.6, duration_min: 44.6 })])[0]).toMatchObject({ day_offset: 2, duration_min: 45 });
  });
});

describe("parseItems", () => {
  it("legge il jsonb salvato e scarta ciò che non è una voce", () => {
    const raw = [{ title: "Pulire il bagno", day_offset: 1, time: "10:00", duration_min: 30, area_id: "a1", attention: "medium" }, { day_offset: 2 }, "testo", null];
    expect(parseItems(raw)).toEqual([{ title: "Pulire il bagno", day_offset: 1, time: "10:00", duration_min: 30, area_id: "a1", attention: "medium" }]);
  });

  it("senza un elenco restituisce nessuna voce", () => {
    expect(parseItems(null)).toEqual([]);
    expect(parseItems({ title: "x" })).toEqual([]);
  });
});

describe("applyTemplate", () => {
  const items = [
    item({ title: "Scegliere il tema", day_offset: 0, attention: "medium", area_id: "yoga" }),
    item({ title: "Provare la sequenza", day_offset: 2, time: "18:00", duration_min: 45 }),
  ];

  it("mette ogni attività alla sua distanza dalla partenza", () => {
    expect(applyTemplate(items, "2026-10-12")).toEqual([
      { title: "Scegliere il tema", notes: null, date: "2026-10-12", time: null, duration_min: null, due_date: null, window_start: null, attention: "medium", area_id: "yoga" },
      { title: "Provare la sequenza", notes: null, date: "2026-10-14", time: "18:00", duration_min: 45, due_date: null, window_start: null, attention: "low", area_id: null },
    ]);
  });

  it("attraversa mesi e anni", () => {
    expect(applyTemplate([item({ day_offset: 3 })], "2026-12-30")[0].date).toBe("2027-01-02");
  });

  it("lascia vuota un'area che non esiste più", () => {
    expect(applyTemplate(items, "2026-10-12", new Set(["lavoro"]))[0].area_id).toBeNull();
    expect(applyTemplate(items, "2026-10-12", new Set(["yoga"]))[0].area_id).toBe("yoga");
  });
});

describe("itemsFromTasks", () => {
  const task = (title: string, date: string | null, time: string | null = null) => ({ title, date, time, duration_min: null, area_id: null, attention: "low" as const });

  it("prende il primo giorno come partenza", () => {
    const out = itemsFromTasks([task("Lavatrice", "2026-10-14"), task("Bagno", "2026-10-12", "10:00:00"), task("Pavimenti", "2026-10-13")]);
    expect(out.map((i) => [i.title, i.day_offset, i.time])).toEqual([
      ["Bagno", 0, "10:00"],
      ["Pavimenti", 1, null],
      ["Lavatrice", 2, null],
    ]);
  });

  it("lascia fuori le attività senza giorno", () => {
    expect(itemsFromTasks([task("Prima o poi", null)])).toEqual([]);
    expect(itemsFromTasks([task("Prima o poi", null), task("Oggi", "2026-10-12")]).map((i) => i.title)).toEqual(["Oggi"]);
  });
});

describe("etichette", () => {
  it("offsetLabel", () => {
    expect([0, 1, 3].map(offsetLabel)).toEqual(["Giorno di partenza", "Il giorno dopo", "Dopo 3 giorni"]);
  });

  it("templateSummary", () => {
    expect(templateSummary([])).toBe("Nessuna attività");
    expect(templateSummary([item({})])).toBe("1 attività");
    expect(templateSummary([item({}), item({ day_offset: 2 })])).toBe("2 attività in 3 giorni");
  });
});
