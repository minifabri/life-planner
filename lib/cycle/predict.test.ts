import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "../dates/local";
import { DEFAULT_CYCLE_DAYS, cycleStats, isCycleCategory, periodsFrom, predictCycle } from "./predict";

function span(start: LocalDate, days: number): LocalDate[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

const sorted = (s: Set<LocalDate>) => [...s].sort();

describe("isCycleCategory", () => {
  it("riconosce Ciclo e simili, senza badare a maiuscole e accenti", () => {
    expect(isCycleCategory("Ciclo")).toBe(true);
    expect(isCycleCategory(" ciclo mestruale")).toBe(true);
    expect(isCycleCategory("Mestruazioni")).toBe(true);
    expect(isCycleCategory("Period")).toBe(true);
    expect(isCycleCategory("Unghie")).toBe(false);
    expect(isCycleCategory("Riciclo")).toBe(false);
  });
});

describe("periodsFrom", () => {
  it("unisce i giorni vicini, anche con un giorno saltato", () => {
    expect(periodsFrom(["2026-09-03", "2026-09-01", "2026-09-02", "2026-09-05", "2026-09-29"])).toEqual([
      { start: "2026-09-01", end: "2026-09-05" },
      { start: "2026-09-29", end: "2026-09-29" },
    ]);
  });

  it("due giorni di pausa separano due cicli", () => {
    expect(periodsFrom(["2026-09-01", "2026-09-04"])).toHaveLength(2);
  });
});

describe("cycleStats", () => {
  it("media degli intervalli e della durata registrata", () => {
    const periods = periodsFrom([...span("2026-07-01", 4), ...span("2026-07-31", 6), ...span("2026-08-30", 5)]);
    expect(cycleStats(periods)).toEqual({ cycleDays: 30, periodDays: 5, basedOn: 2 });
  });

  it("con un solo inizio registrato usa 28 e 5", () => {
    expect(cycleStats(periodsFrom(["2026-10-01"]))).toEqual({ cycleDays: DEFAULT_CYCLE_DAYS, periodDays: 5, basedOn: 0 });
  });

  it("ignora gli intervalli impossibili (un ciclo non registrato)", () => {
    const periods = periodsFrom(["2026-05-01", "2026-05-29", "2026-07-24"]);
    expect(cycleStats(periods)).toMatchObject({ cycleDays: 28, basedOn: 1 });
  });

  it("tiene solo gli ultimi sei intervalli", () => {
    const starts = ["2025-12-01", "2026-01-10", "2026-02-07", "2026-03-07", "2026-04-04", "2026-05-02", "2026-05-30", "2026-06-27"];
    // Il primo intervallo (40 giorni) esce dalla media: restano sei intervalli di 28.
    expect(cycleStats(periodsFrom(starts))).toMatchObject({ cycleDays: 28, basedOn: 6 });
  });
});

describe("predictCycle", () => {
  it("senza registrazioni non prevede nulla", () => {
    expect(predictCycle([], "2026-10-16", "2026-10-01", "2026-10-31")).toBeNull();
  });

  it("prossimo ciclo e giorni fertili da un ciclo di 28 giorni", () => {
    const dates = [...span("2026-09-03", 5), ...span("2026-10-01", 5)];
    const p = predictCycle(dates, "2026-10-16", "2026-10-01", "2026-11-30")!;
    expect(p.nextStart).toBe("2026-10-29");
    expect(p.lateDays).toBe(0);
    // Ovulazione il 15 ottobre: fertili dal 10 al 16.
    expect(sorted(p.fertile).filter((d) => d < "2026-10-20")).toEqual(span("2026-10-10", 7));
    expect(sorted(p.period).filter((d) => d < "2026-11-10")).toEqual(span("2026-10-29", 5));
    // Il ciclo dopo: 26 novembre.
    expect(p.period.has("2026-11-26")).toBe(true);
    expect(p.fertile.has("2026-11-12")).toBe(true);
  });

  it("non segna come previsti né fertili i giorni già registrati o passati", () => {
    const dates = span("2026-10-01", 5);
    const p = predictCycle(dates, "2026-10-16", "2026-09-01", "2026-10-31")!;
    expect([...p.period].every((d) => d >= "2026-10-16")).toBe(true);
    expect([...p.fertile].every((d) => d > "2026-10-05")).toBe(true);
    expect(p.period.has("2026-10-02")).toBe(false);
  });

  it("resta nell'intervallo richiesto", () => {
    const p = predictCycle(span("2026-10-01", 5), "2026-10-16", "2026-11-01", "2026-11-07")!;
    expect([...p.period, ...p.fertile].every((d) => d >= "2026-11-01" && d <= "2026-11-07")).toBe(true);
    // Il ciclo previsto dal 29 ottobre al 2 novembre.
    expect(sorted(p.period)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("in ritardo: il ciclo è atteso da oggi", () => {
    const p = predictCycle(span("2026-09-10", 4), "2026-10-12", "2026-10-01", "2026-10-31")!;
    expect(p.lateDays).toBe(4);
    expect(p.nextStart).toBe("2026-10-12");
    expect(sorted(p.period)).toEqual(span("2026-10-12", 4));
  });

  it("in ritardo da troppo: probabilmente manca una registrazione e si torna al calendario", () => {
    const p = predictCycle(span("2026-08-01", 4), "2026-10-16", "2026-10-01", "2026-10-31")!;
    expect(p.lateDays).toBeGreaterThan(14);
    expect(p.period.has("2026-10-16")).toBe(false);
    // 1 agosto + 28 × 3 = 24 ottobre.
    expect(p.period.has("2026-10-24")).toBe(true);
  });

  it("un giorno non è mai insieme previsto e fertile", () => {
    const p = predictCycle(["2026-10-01", "2026-10-21"], "2026-10-16", "2026-10-01", "2026-12-31")!;
    expect(p.cycleDays).toBe(20);
    for (const d of p.period) expect(p.fertile.has(d)).toBe(false);
  });
});
