import { describe, expect, it } from "vitest";
import { COLOR_OPTIONS } from "./categories";
import { dominantColors, garmentColors, paletteColor, suggestName } from "./colors";

function pixels(...groups: [rgb: [number, number, number], times: number][]): number[] {
  return groups.flatMap(([rgb, times]) => Array.from({ length: times }, () => [...rgb, 255]).flat());
}

/** Un'immagine a tinta unita con un rettangolo al centro, come RGBA. */
function scene(size: number, background: [number, number, number], garment: [number, number, number], from = 0.25, to = 0.75): number[] {
  const data: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.push(...(x >= size * from && x < size * to && y >= size * from && y < size * to ? garment : background), 255);
  return data;
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
  });

  it("distingue i colori che prima finivano in quelli vicini", () => {
    expect(paletteColor(110, 70, 45)).toBe("marrone");
    expect(paletteColor(240, 170, 190)).toBe("rosa");
    expect(paletteColor(205, 160, 40)).toBe("giallo");
    expect(paletteColor(240, 130, 30)).toBe("arancione");
    expect(paletteColor(140, 185, 230)).toBe("azzurro");
    expect(paletteColor(110, 20, 40)).toBe("bordeaux");
    expect(paletteColor(120, 150, 185)).toBe("blu");
  });

  it("legge come nero un capo nero fotografato alla luce, e come blu un blu notte", () => {
    expect(paletteColor(45, 45, 50)).toBe("nero");
    expect(paletteColor(62, 60, 64)).toBe("nero");
    expect(paletteColor(85, 85, 90)).toBe("grigio");
    expect(paletteColor(25, 30, 65)).toBe("blu");
    expect(paletteColor(215, 214, 210)).toBe("bianco");
  });

  it("non propone mai oro e argento: da una foto sono giallo e grigio", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) seen.add(paletteColor(r, g, b));
    expect(seen.has("oro")).toBe(false);
    expect(seen.has("argento")).toBe(false);
    expect([...seen].every((c) => COLOR_OPTIONS.includes(c))).toBe(true);
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

  it("le pieghe e le ombre non sono un secondo colore", () => {
    // Nero con pieghe grigio scuro, bianco con ombre grigio chiaro, blu con pieghe nere, beige su bianco.
    expect(dominantColors(pixels([[40, 40, 44], 60], [[80, 80, 84], 40]))).toEqual(["nero"]);
    expect(dominantColors(pixels([[240, 240, 238], 45], [[195, 195, 193], 55]))).toEqual(["bianco"]);
    expect(dominantColors(pixels([[30, 40, 90], 45], [[20, 20, 24], 55]))).toEqual(["blu"]);
    expect(dominantColors(pixels([[245, 245, 243], 70], [[225, 205, 175], 30]))).toEqual(["bianco"]);
  });

  it("un grigio resta grigio, anche se scuro o chiaro", () => {
    expect(dominantColors(pixels([[85, 85, 90], 100]))).toEqual(["grigio"]);
    expect(dominantColors(pixels([[190, 190, 192], 100]))).toEqual(["grigio"]);
  });

  it("con la maschera conta solo i pixel del capo", () => {
    expect(dominantColors(pixels([[250, 250, 248], 3], [[200, 30, 40], 1]), [0, 0, 0, 1])).toEqual(["rosso"]);
  });
});

describe("garmentColors", () => {
  it("toglie lo sfondo uniforme, anche quando occupa più spazio del capo", () => {
    expect(garmentColors(scene(24, [245, 245, 243], [200, 30, 40], 0.3, 0.7), 24, 24)).toEqual(["rosso"]);
    expect(garmentColors(scene(24, [150, 110, 70], [30, 30, 34]), 24, 24)).toEqual(["nero"]);
  });

  it("segue le ombre graduali dello sfondo", () => {
    const size = 24;
    const data: number[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const wall = 245 - x * 3;
        data.push(...(x >= 7 && x < 17 && y >= 7 && y < 17 ? [40, 70, 170] : [wall, wall, wall]), 255);
      }
    expect(garmentColors(data, size, size)).toEqual(["blu"]);
  });

  it("senza uno sfondo riconoscibile guarda il centro della foto", () => {
    const size = 24;
    const data = scene(size, [0, 0, 0], [40, 130, 70]);
    // Bordi a scacchi di colori diversi: nessuno prevale.
    const noisy = [[200, 30, 40], [40, 70, 170], [250, 215, 40], [240, 130, 30]];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (x >= size * 0.25 && x < size * 0.75 && y >= size * 0.25 && y < size * 0.75) continue;
        data.splice((y * size + x) * 4, 3, ...noisy[(x + y * 3) % 4]);
      }
    expect(garmentColors(data, size, size)).toEqual(["verde"]);
  });

  it("un capo dello stesso colore dello sfondo non sparisce", () => {
    expect(garmentColors(scene(24, [245, 245, 243], [247, 247, 245]), 24, 24)).toEqual(["bianco"]);
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

  it("accorda il colore ai tipi di capo noti e ai colori nuovi", () => {
    expect(suggestName("bottom", "gonna", ["nero"])).toBe("Gonna nera");
    expect(suggestName("shoes", "stivaletti", ["marrone"])).toBe("Stivaletti marroni");
    expect(suggestName("outerwear", "giacca di pelle", ["nero"])).toBe("Giacca di pelle nera");
    expect(suggestName("top", "Camicia", ["azzurro"])).toBe("Camicia azzurra");
    expect(suggestName("shoes", "sneakers", ["rosa"])).toBe("Sneakers rosa");
    expect(suggestName("top", "maglione", [])).toBe("Maglione");
  });
});
