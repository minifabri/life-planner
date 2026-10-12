import { describe, expect, it } from "vitest";
import { dominantColors, paletteColor, suggestName } from "./colors";

function pixels(...groups: [rgb: [number, number, number], times: number][]): number[] {
  return groups.flatMap(([rgb, times]) => Array.from({ length: times }, () => [...rgb, 255]).flat());
}

describe("paletteColor", () => {
  it("riconosce i colori della tavolozza", () => {
    expect(paletteColor(15, 15, 18)).toBe("nero");
    expect(paletteColor(250, 250, 248)).toBe("bianco");
    expect(paletteColor(120, 120, 125)).toBe("grigio");
    expect(paletteColor(200, 30, 40)).toBe("rosso");
    expect(paletteColor(40, 70, 170)).toBe("blu");
    expect(paletteColor(40, 130, 70)).toBe("verde");
    expect(paletteColor(180, 150, 220)).toBe("lilla");
    expect(paletteColor(225, 205, 175)).toBe("beige");
    expect(paletteColor(205, 160, 40)).toBe("oro");
  });
});

describe("dominantColors", () => {
  it("propone il colore che prevale", () => {
    expect(dominantColors(pixels([[15, 15, 18], 90], [[200, 30, 40], 10]))).toEqual(["nero"]);
  });

  it("propone al più due colori, dal più presente", () => {
    expect(dominantColors(pixels([[15, 15, 18], 50], [[250, 250, 248], 30], [[40, 70, 170], 20]))).toEqual(["nero", "bianco"]);
  });

  it("ignora i pixel trasparenti e non propone nulla senza dati", () => {
    expect(dominantColors([200, 30, 40, 0, 200, 30, 40, 0])).toEqual([]);
    expect(dominantColors([])).toEqual([]);
  });
});

describe("suggestName", () => {
  it("unisce il tipo di capo e il colore, accordati", () => {
    expect(suggestName("top", null, ["nero"])).toBe("Top nero");
    expect(suggestName("shoes", null, ["bianco", "nero"])).toBe("Scarpe bianche");
    expect(suggestName("bag", null, ["rosso"])).toBe("Borsa rossa");
    expect(suggestName("bottom", null, ["grigio"])).toBe("Pantaloni grigi");
    expect(suggestName("dress", null, ["lilla"])).toBe("Vestito lilla");
  });

  it("senza colore propone solo il tipo", () => {
    expect(suggestName("outerwear", null, [])).toBe("Capospalla");
    expect(suggestName("top", null, ["altro"])).toBe("Top");
  });

  it("preferisce la sottocategoria scritta a mano", () => {
    expect(suggestName("bottom", "gonna midi", ["nero"])).toBe("Gonna midi nero");
  });
});
