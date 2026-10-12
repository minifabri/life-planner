import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STYLE_OPTIONS } from "./categories";
import { NOTHING, decodeTable, recognize, type VisionTable } from "./vision";
import embeddings from "./vision-embeddings.gen.json";
import { GARMENT_TYPES, MATERIAL_PROMPTS, STYLE_PROMPTS, garmentTypeNamed, visionPrompts } from "./vision-labels";

const table = decodeTable(embeddings);
const typeIndex = (name: string) => GARMENT_TYPES.findIndex((t) => t.name === name);

/** Un vettore fatto di più descrizioni mescolate, come quello di una foto che somiglia a ciascuna in quella misura. */
function mix(...parts: [row: Float32Array, weight: number][]): Float32Array {
  const out = new Float32Array(embeddings.dim);
  for (const [row, weight] of parts) for (let i = 0; i < out.length; i++) out[i] += row[i] * weight;
  return out;
}

describe("descrizioni del riconoscimento", () => {
  it("il file generato corrisponde alle descrizioni: altrimenti va rilanciato `pnpm build:vision`", () => {
    expect(createHash("sha256").update(JSON.stringify(visionPrompts())).digest("hex")).toBe(embeddings.promptsHash);
    expect(table.types).toHaveLength(GARMENT_TYPES.length);
    expect(table.styles).toHaveLength(Object.keys(STYLE_PROMPTS).length);
    expect(table.materials).toHaveLength(Object.keys(MATERIAL_PROMPTS).length);
  });

  it("ogni riga è un vettore unitario", () => {
    for (const row of [...table.types, ...table.styles, ...table.materials]) expect(Math.hypot(...row)).toBeCloseTo(1, 3);
  });

  it("gli stili sono quelli dell'app e i nomi dei tipi sono unici", () => {
    expect(Object.keys(STYLE_PROMPTS).sort()).toEqual([...STYLE_OPTIONS].sort());
    expect(new Set(GARMENT_TYPES.map((t) => t.name)).size).toBe(GARMENT_TYPES.length);
    expect(garmentTypeNamed(" Stivaletti ")?.category).toBe("shoes");
    expect(garmentTypeNamed("gonna midi")).toBeNull();
  });
});

describe("recognize", () => {
  it("riconosce il tipo quando la foto somiglia chiaramente a una descrizione", () => {
    const found = recognize(table.types[typeIndex("stivaletti")], table);
    expect(found.category).toBe("shoes");
    expect(found.type?.name).toBe("stivaletti");
  });

  it("tra due tipi vicini della stessa categoria propone la categoria ma non il tipo", () => {
    const found = recognize(mix([table.types[typeIndex("stivali")], 1], [table.types[typeIndex("stivaletti")], 1]), table);
    expect(found.category).toBe("shoes");
    expect(found.type).toBeNull();
  });

  it("tra due categorie non propone nulla", () => {
    expect(recognize(mix([table.types[typeIndex("gonna")], 1], [table.types[typeIndex("borsa")], 1]), table)).toEqual(NOTHING);
  });

  it("una foto che non somiglia a nessun capo non propone nulla", () => {
    const flat: VisionTable = { ...table, types: table.types.map(() => new Float32Array(embeddings.dim)) };
    expect(recognize(table.types[0], flat)).toEqual(NOTHING);
    expect(recognize(new Float32Array(embeddings.dim), table)).toEqual(NOTHING);
  });

  it("alcuni tipi dicono già il materiale", () => {
    expect(recognize(table.types[typeIndex("giacca di pelle")], table).material).toBe("pelle");
    expect(recognize(table.types[typeIndex("maglione")], table).material).toBe("lana");
  });

  it("il jeans come materiale si propone solo dove è plausibile", () => {
    const denim = table.materials[Object.keys(MATERIAL_PROMPTS).indexOf("jeans")];
    expect(recognize(mix([table.types[typeIndex("gonna")], 1], [denim, 1]), table).material).toBe("jeans");
    expect(recognize(mix([table.types[typeIndex("zaino")], 1], [denim, 1]), table).material).toBeNull();
  });

  it("propone uno stile solo quando è netto", () => {
    const gothic = table.styles[Object.keys(STYLE_PROMPTS).indexOf("gothic")];
    expect(recognize(mix([table.types[typeIndex("vestito")], 1], [gothic, 0.6]), table).styles).toEqual(["gothic"]);
  });
});
