import { describe, expect, it } from "vitest";
import { dayLoad, loadSplit } from "./load";

describe("dayLoad", () => {
  it("somma le durate e sceglie il livello", () => {
    expect(dayLoad([30, null, 60])).toEqual({ minutes: 90, level: "light", ratio: 90 / 480 });
    expect(dayLoad([]).level).toBe("empty");
    expect(dayLoad([200, 200]).level).toBe("full");
  });
});

describe("loadSplit", () => {
  const items = [
    { startMin: 9 * 60 + 30, minutes: 30 },
    { startMin: 11 * 60, minutes: 60 },
    { startMin: 19 * 60, minutes: 75 },
    { startMin: 21 * 60, minutes: 60 },
    { startMin: null, minutes: 15 },
  ];

  it("separa ciò che è passato da ciò che resta", () => {
    const split = loadSplit(items, 14 * 60 + 47);
    expect(split.past).toBeCloseTo(90 / 480);
    expect(split.rest).toBeCloseTo(150 / 480);
  });

  it("un impegno in corso conta in parte come passato", () => {
    expect(loadSplit([{ startMin: 10 * 60, minutes: 60 }], 10 * 60 + 30).past).toBeCloseTo(30 / 480);
  });

  it("nomina la parte più piena solo se supera le due ore", () => {
    expect(loadSplit(items, 0).peak).toBe("evening");
    expect(loadSplit(items.slice(0, 3), 0).peak).toBeNull();
  });

  it("non supera la barra piena", () => {
    const split = loadSplit([{ startMin: 8 * 60, minutes: 600 }], 24 * 60);
    expect(split.past).toBe(1);
    expect(split.rest).toBe(0);
  });

  it("senza impegni è vuota", () => {
    expect(loadSplit([], 600)).toEqual({ past: 0, rest: 0, peak: null });
  });
});
