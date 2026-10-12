import type { WardrobeCategory, WardrobeStatus } from "../supabase/types";

export const CATEGORY_LABEL: Record<WardrobeCategory, string> = {
  top: "Top",
  bottom: "Pantaloni/Gonne",
  dress: "Vestiti",
  outerwear: "Capispalla",
  shoes: "Scarpe",
  accessory: "Accessori",
  bag: "Borse",
  other: "Altro",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as WardrobeCategory[];

export const STATUS_LABEL: Record<WardrobeStatus, string> = {
  clean: "Pulito",
  worn: "Indossato",
  to_wash: "Da lavare",
};

export const STATUSES = Object.keys(STATUS_LABEL) as WardrobeStatus[];

export const SEASON_LABEL: Record<string, string> = {
  spring: "Primavera",
  summer: "Estate",
  autumn: "Autunno",
  winter: "Inverno",
};

export const SEASONS = Object.keys(SEASON_LABEL);

export const STYLE_OPTIONS = ["minimal", "urban", "gothic", "elegante", "cyber", "sportivo", "casual"];

export const OCCASION_OPTIONS = ["quotidiano", "ufficio", "serata", "aperitivo", "sport", "cerimonia"];

export const COLOR_OPTIONS = ["nero", "bianco", "grigio", "beige", "marrone", "blu", "azzurro", "verde", "giallo", "arancione", "rosso", "bordeaux", "rosa", "lilla", "oro", "argento", "altro"];
