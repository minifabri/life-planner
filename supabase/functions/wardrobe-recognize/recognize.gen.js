// File generato da scripts/build-functions.mjs a partire da lib/wardrobe/recognize.ts. Non modificare a mano.

// lib/wardrobe/categories.ts
var CATEGORY_LABEL = {
  top: "Top",
  bottom: "Pantaloni/Gonne",
  dress: "Vestiti",
  outerwear: "Capispalla",
  shoes: "Scarpe",
  accessory: "Accessori",
  bag: "Borse",
  other: "Altro"
};
var CATEGORIES = Object.keys(CATEGORY_LABEL);
var STATUS_LABEL = {
  clean: "Pulito",
  worn: "Indossato",
  to_wash: "Da lavare"
};
var STATUSES = Object.keys(STATUS_LABEL);
var SEASON_LABEL = {
  spring: "Primavera",
  summer: "Estate",
  autumn: "Autunno",
  winter: "Inverno"
};
var SEASONS = Object.keys(SEASON_LABEL);
var STYLE_OPTIONS = ["minimal", "urban", "gothic", "elegante", "cyber", "sportivo", "casual"];
var COLOR_OPTIONS = ["nero", "bianco", "grigio", "lilla", "beige", "blu", "rosso", "verde", "oro", "argento", "altro"];

// lib/wardrobe/recognize.ts
var RECOGNITION_SCHEMA = {
  type: "object",
  properties: {
    is_garment: { type: "boolean", description: "false se nella foto non si riconosce un capo, una scarpa, una borsa o un accessorio" },
    category: { type: "string", enum: CATEGORIES },
    subcategory: { type: "string", description: 'Tipo specifico in italiano, minuscolo, due o tre parole al massimo (es. "gonna midi", "stivaletti"). Stringa vuota se non \xE8 chiaro.' },
    colors: { type: "array", items: { type: "string", enum: COLOR_OPTIONS }, description: "I colori principali del capo, al pi\xF9 due, dal pi\xF9 presente. Ignora lo sfondo." },
    styles: { type: "array", items: { type: "string", enum: STYLE_OPTIONS }, description: "Al pi\xF9 due stili, solo se evidenti dalla foto; altrimenti vuoto." },
    name: { type: "string", description: 'Nome breve in italiano, da due a quattro parole, con il colore accordato (es. "Gonna midi nera"). Niente marca, niente punto finale.' }
  },
  required: ["is_garment", "category", "subcategory", "colors", "styles", "name"],
  additionalProperties: false
};
var RECOGNITION_PROMPT = `Questa \xE8 la foto di un capo che sto aggiungendo al catalogo del mio guardaroba. Descrivi il capo principale della foto compilando i campi richiesti.

Le categorie: "top" (maglie, camicie, felpe, canotte), "bottom" (pantaloni, gonne, shorts), "dress" (vestiti, tute intere), "outerwear" (giacche, cappotti, cardigan pesanti), "shoes", "accessory" (gioielli, cinture, sciarpe, cappelli, occhiali), "bag", "other" (tutto ci\xF2 che non rientra nelle precedenti).

Compila solo ci\xF2 che si vede: se un dettaglio non \xE8 chiaro lascia vuoto il campo corrispondente, perch\xE9 poi lo correggo a mano e un campo vuoto mi costa meno di uno sbagliato. Se il colore non \xE8 tra quelli ammessi scegli "altro".`;
var MAX_IMAGE_BASE64 = 7e5;
function looksLikeJpegBase64(value) {
  return typeof value === "string" && value.length > 100 && value.length <= MAX_IMAGE_BASE64 && /^\/9j\/[A-Za-z0-9+/]+=*$/.test(value);
}
function known(values, allowed, max) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v) => typeof v === "string" && allowed.includes(v)))].slice(0, max);
}
function clean(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return text && text.length <= maxLength ? text : null;
}
function parseRecognition(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || data.is_garment !== true) return null;
  if (typeof data.category !== "string" || !CATEGORIES.includes(data.category)) return null;
  return {
    category: data.category,
    subcategory: clean(data.subcategory, 40)?.toLowerCase() ?? null,
    colors: known(data.colors, COLOR_OPTIONS, 2),
    styles: known(data.styles, STYLE_OPTIONS, 2),
    name: clean(data.name, 60)
  };
}
export {
  MAX_IMAGE_BASE64,
  RECOGNITION_PROMPT,
  RECOGNITION_SCHEMA,
  looksLikeJpegBase64,
  parseRecognition
};
