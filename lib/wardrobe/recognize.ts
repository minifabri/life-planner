import type { WardrobeCategory } from "../supabase/types";
import { CATEGORIES, COLOR_OPTIONS, STYLE_OPTIONS } from "./categories";

/**
 * Riconoscimento del capo dalla foto con un modello di visione (facoltativo: senza chiave configurata l'app
 * funziona come prima). Qui stanno la richiesta e la lettura della risposta, usate dalla Edge Function
 * `wardrobe-recognize` e coperte dai test; la chiamata al servizio è nella funzione.
 */

export type Recognition = {
  category: WardrobeCategory;
  subcategory: string | null;
  colors: string[];
  styles: string[];
  name: string | null;
};

/** Schema della risposta: i valori ammessi sono quelli dell'app, così non serve tradurre nulla. */
export const RECOGNITION_SCHEMA = {
  type: "object",
  properties: {
    is_garment: { type: "boolean", description: "false se nella foto non si riconosce un capo, una scarpa, una borsa o un accessorio" },
    category: { type: "string", enum: CATEGORIES },
    subcategory: { type: "string", description: "Tipo specifico in italiano, minuscolo, due o tre parole al massimo (es. \"gonna midi\", \"stivaletti\"). Stringa vuota se non è chiaro." },
    colors: { type: "array", items: { type: "string", enum: COLOR_OPTIONS }, description: "I colori principali del capo, al più due, dal più presente. Ignora lo sfondo." },
    styles: { type: "array", items: { type: "string", enum: STYLE_OPTIONS }, description: "Al più due stili, solo se evidenti dalla foto; altrimenti vuoto." },
    name: { type: "string", description: "Nome breve in italiano, da due a quattro parole, con il colore accordato (es. \"Gonna midi nera\"). Niente marca, niente punto finale." },
  },
  required: ["is_garment", "category", "subcategory", "colors", "styles", "name"],
  additionalProperties: false,
} as const;

export const RECOGNITION_PROMPT = `Questa è la foto di un capo che sto aggiungendo al catalogo del mio guardaroba. Descrivi il capo principale della foto compilando i campi richiesti.

Le categorie: "top" (maglie, camicie, felpe, canotte), "bottom" (pantaloni, gonne, shorts), "dress" (vestiti, tute intere), "outerwear" (giacche, cappotti, cardigan pesanti), "shoes", "accessory" (gioielli, cinture, sciarpe, cappelli, occhiali), "bag", "other" (tutto ciò che non rientra nelle precedenti).

Compila solo ciò che si vede: se un dettaglio non è chiaro lascia vuoto il campo corrispondente, perché poi lo correggo a mano e un campo vuoto mi costa meno di uno sbagliato. Se il colore non è tra quelli ammessi scegli "altro".`;

/** Dimensione massima della foto inviata (base64): il client la riduce prima, questo è il limite di sicurezza. */
export const MAX_IMAGE_BASE64 = 700_000;

export function looksLikeJpegBase64(value: unknown): value is string {
  return typeof value === "string" && value.length > 100 && value.length <= MAX_IMAGE_BASE64 && /^\/9j\/[A-Za-z0-9+/]+=*$/.test(value);
}

function known(values: unknown, allowed: readonly string[], max: number): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is string => typeof v === "string" && allowed.includes(v)))].slice(0, max);
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return text && text.length <= maxLength ? text : null;
}

/**
 * Legge la risposta del modello e tiene solo ciò che l'app conosce. `null` se la risposta non è leggibile
 * o se nella foto non c'è un capo: in quel caso non si propone nulla.
 */
export function parseRecognition(text: string): Recognition | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || data.is_garment !== true) return null;
  if (typeof data.category !== "string" || !(CATEGORIES as string[]).includes(data.category)) return null;
  return {
    category: data.category as WardrobeCategory,
    subcategory: clean(data.subcategory, 40)?.toLowerCase() ?? null,
    colors: known(data.colors, COLOR_OPTIONS, 2),
    styles: known(data.styles, STYLE_OPTIONS, 2),
    name: clean(data.name, 60),
  };
}
