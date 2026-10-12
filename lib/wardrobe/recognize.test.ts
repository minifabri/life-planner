import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BASE64, RECOGNITION_SCHEMA, looksLikeJpegBase64, parseRecognition } from "./recognize";

const reply = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ is_garment: true, category: "bottom", subcategory: "Gonna midi", colors: ["nero"], styles: ["gothic"], name: "Gonna midi nera.", ...patch });

describe("parseRecognition", () => {
  it("legge una risposta completa e la ripulisce", () => {
    expect(parseRecognition(reply())).toEqual({ category: "bottom", subcategory: "gonna midi", colors: ["nero"], styles: ["gothic"], name: "Gonna midi nera" });
  });

  it("tiene solo colori e stili che l'app conosce, al più due", () => {
    const result = parseRecognition(reply({ colors: ["nero", "fucsia", "bianco", "grigio"], styles: ["boho", "minimal"] }));
    expect(result?.colors).toEqual(["nero", "bianco"]);
    expect(result?.styles).toEqual(["minimal"]);
  });

  it("i campi vuoti restano vuoti", () => {
    const result = parseRecognition(reply({ subcategory: "", name: "  ", colors: [], styles: [] }));
    expect(result).toEqual({ category: "bottom", subcategory: null, colors: [], styles: [], name: null });
  });

  it("non propone nulla se nella foto non c'è un capo", () => {
    expect(parseRecognition(reply({ is_garment: false }))).toBeNull();
  });

  it("non propone nulla se la risposta non è leggibile o la categoria non esiste", () => {
    expect(parseRecognition("non è json")).toBeNull();
    expect(parseRecognition("null")).toBeNull();
    expect(parseRecognition(reply({ category: "cappelli" }))).toBeNull();
  });

  it("scarta testi troppo lunghi", () => {
    expect(parseRecognition(reply({ name: "x".repeat(80) }))?.name).toBeNull();
  });
});

describe("richiesta", () => {
  it("lo schema chiede tutti i campi e non ne ammette altri", () => {
    expect(RECOGNITION_SCHEMA.additionalProperties).toBe(false);
    expect([...RECOGNITION_SCHEMA.required].sort()).toEqual(Object.keys(RECOGNITION_SCHEMA.properties).sort());
  });

  it("accetta solo un JPEG in base64 entro il limite", () => {
    const jpeg = `/9j/${"A".repeat(200)}`;
    expect(looksLikeJpegBase64(jpeg)).toBe(true);
    expect(looksLikeJpegBase64(`iVBOR${"A".repeat(200)}`)).toBe(false);
    expect(looksLikeJpegBase64(`/9j/${"A".repeat(MAX_IMAGE_BASE64)}`)).toBe(false);
    expect(looksLikeJpegBase64(42)).toBe(false);
  });
});
