import { describe, expect, it } from "vitest";
import type { LogCategory, LogEntry } from "../supabase/types";
import {
  NO_FILTER,
  daysAgoLabel,
  groupByMonth,
  lastSeenByCategory,
  logDays,
  monthLabel,
  parseTags,
  periodStart,
  tagsOf,
  timelineRows,
} from "./timeline";

const TODAY = "2026-10-10";

function entry(over: Partial<LogEntry> & { id: string; date: string }): LogEntry {
  return { category_id: null, title: over.id, notes: null, time: null, tags: [], is_sensitive: false, deleted_at: null, created_at: `${over.date}T08:00:00Z`, ...over };
}

function category(over: Partial<LogCategory> & { id: string }): LogCategory {
  return { name: over.id, color: "#A3A9B8", is_sensitive: false, track_last: true, keywords: [], sort_order: 0, ...over };
}

const entries = [
  entry({ id: "unghie viola", date: "2026-09-22", category_id: "unghie", tags: ["viola", "semipermanente"] }),
  entry({ id: "taglio", date: "2026-10-02", category_id: "capelli", notes: "Scalato, da Elisabetta" }),
  entry({ id: "unghie rosse", date: "2026-08-15", category_id: "unghie", tags: ["rosso"] }),
  entry({ id: "mattina", date: "2026-10-02", time: "08:30:00" }),
  entry({ id: "eliminata", date: "2026-10-05", deleted_at: "2026-10-06T00:00:00Z" }),
];
const stubs = [{ id: "s1", date: "2026-10-01" }, { id: "s2", date: "2025-12-24" }];

const titles = (rows: ReturnType<typeof timelineRows>) => rows.map((r) => (r.kind === "entry" ? r.entry.title : `riservata ${r.stub.date}`));

describe("timelineRows", () => {
  it("ordina dalla più recente e mescola i segnaposto delle riservate", () => {
    expect(titles(timelineRows(entries, stubs, NO_FILTER, TODAY))).toEqual([
      "mattina",
      "taglio",
      "riservata 2026-10-01",
      "unghie viola",
      "unghie rosse",
      "riservata 2025-12-24",
    ]);
  });

  it("filtra per categoria, tag e testo (senza badare ad accenti e maiuscole)", () => {
    expect(titles(timelineRows(entries, stubs, { ...NO_FILTER, categoryId: "unghie" }, TODAY))).toEqual(["unghie viola", "unghie rosse"]);
    expect(titles(timelineRows(entries, stubs, { ...NO_FILTER, tag: "viola" }, TODAY))).toEqual(["unghie viola"]);
    expect(titles(timelineRows(entries, stubs, { ...NO_FILTER, query: "ELISABETTA" }, TODAY))).toEqual(["taglio"]);
    expect(titles(timelineRows(entries, stubs, { ...NO_FILTER, query: "semiperm" }, TODAY))).toEqual(["unghie viola"]);
  });

  it("cercando qualcosa di preciso i segnaposto spariscono: non si può sapere se corrispondono", () => {
    expect(timelineRows(entries, stubs, { ...NO_FILTER, query: "x" }, TODAY)).toEqual([]);
  });

  it("il periodo vale per tutte le righe", () => {
    expect(titles(timelineRows(entries, stubs, { ...NO_FILTER, period: "30d" }, TODAY))).toEqual([
      "mattina",
      "taglio",
      "riservata 2026-10-01",
      "unghie viola",
    ]);
    expect(periodStart("year", TODAY)).toBe("2026-01-01");
    expect(periodStart("all", TODAY)).toBeNull();
  });

  it("una riservata già leggibile (Log sbloccato) non compare due volte", () => {
    const unlocked = [...entries, entry({ id: "s1", date: "2026-10-01", title: "Ciclo", is_sensitive: true })];
    expect(titles(timelineRows(unlocked, stubs, NO_FILTER, TODAY)).filter((t) => t.includes("2026-10-01") || t === "Ciclo")).toEqual(["Ciclo"]);
  });
});

describe("groupByMonth", () => {
  it("raggruppa per mese mantenendo l'ordine", () => {
    const groups = groupByMonth(timelineRows(entries, [], NO_FILTER, TODAY));
    expect(groups.map((g) => [g.month, g.rows.length])).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
      ["2026-08", 1],
    ]);
    expect(monthLabel("2026-10")).toBe("Ottobre 2026");
  });
});

describe("ultima volta", () => {
  it("dice solo quanto tempo fa", () => {
    expect(daysAgoLabel("2026-10-10", TODAY)).toBe("oggi");
    expect(daysAgoLabel("2026-10-09", TODAY)).toBe("ieri");
    expect(daysAgoLabel("2026-09-22", TODAY)).toBe("18 giorni fa");
    expect(daysAgoLabel("2026-10-13", TODAY)).toBe("tra 3 giorni");
  });

  it("prende l'ultima registrazione già avvenuta di ogni categoria", () => {
    const categories = [category({ id: "unghie" }), category({ id: "capelli" }), category({ id: "vuota" })];
    const future = [...entries, entry({ id: "prenotata", date: "2026-10-20", category_id: "unghie" })];
    const seen = lastSeenByCategory(categories, future, TODAY, false);
    expect(seen.map((s) => [s.category.id, s.last, s.count, s.hidden])).toEqual([
      ["unghie", "2026-09-22", 3, false],
      ["capelli", "2026-10-02", 1, false],
      ["vuota", null, 0, false],
    ]);
  });

  it("a Log bloccato le categorie riservate non mostrano l'ultima volta", () => {
    const categories = [category({ id: "ciclo", is_sensitive: true })];
    expect(lastSeenByCategory(categories, [], TODAY, false)[0].hidden).toBe(true);
    expect(lastSeenByCategory(categories, [], TODAY, true)[0].hidden).toBe(false);
  });
});

describe("tag", () => {
  it("elenca i tag dal più usato", () => {
    const more = [...entries, entry({ id: "altra", date: "2026-07-01", tags: ["rosso"] })];
    expect(tagsOf(more)).toEqual(["rosso", "semipermanente", "viola"]);
  });

  it("legge i tag scritti a mano", () => {
    expect(parseTags("Viola, #semipermanente ,, viola\nGel")).toEqual(["viola", "semipermanente", "gel"]);
    expect(parseTags("  ")).toEqual([]);
  });
});

describe("logDays", () => {
  it("segna i giorni con almeno una registrazione, riservata o no", () => {
    expect([...logDays(entries, stubs)].sort()).toEqual(["2025-12-24", "2026-08-15", "2026-09-22", "2026-10-01", "2026-10-02"]);
  });
});
