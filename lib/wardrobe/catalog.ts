import type { WardrobeCategory } from "../supabase/types";

export type Suggestion = {
  seasons: string[];
  styles: string[];
  occasions: string[];
  warmth: 1 | 2 | 3 | 4 | 5;
  layerable: boolean;
};

/** Punto di partenza per categoria: sempre correggibile a mano, mai bloccante. */
const CATEGORY_DEFAULTS: Record<WardrobeCategory, Suggestion> = {
  top: { seasons: ["spring", "autumn"], styles: [], occasions: ["quotidiano"], warmth: 2, layerable: true },
  bottom: { seasons: ["spring", "autumn", "winter"], styles: [], occasions: ["quotidiano"], warmth: 3, layerable: false },
  dress: { seasons: ["summer"], styles: ["elegante"], occasions: ["serata"], warmth: 2, layerable: false },
  outerwear: { seasons: ["autumn", "winter"], styles: [], occasions: ["quotidiano"], warmth: 4, layerable: true },
  shoes: { seasons: [], styles: [], occasions: ["quotidiano"], warmth: 2, layerable: false },
  accessory: { seasons: [], styles: [], occasions: [], warmth: 1, layerable: true },
  bag: { seasons: [], styles: [], occasions: [], warmth: 1, layerable: false },
  other: { seasons: [], styles: [], occasions: [], warmth: 2, layerable: false },
};

/** Parole nel nome che affinano il suggerimento (es. "cappotto" è più pesante di un outerwear generico). */
const KEYWORD_RULES: { match: RegExp; patch: Partial<Suggestion> }[] = [
  { match: /cappotto|piumino|parka/i, patch: { seasons: ["autumn", "winter"], warmth: 5, layerable: true } },
  { match: /canotta/i, patch: { seasons: ["summer"], warmth: 1, layerable: true } },
  { match: /maglietta|t-shirt|top corto|polo/i, patch: { seasons: ["spring", "summer"], warmth: 1 } },
  { match: /pantaloncini|shorts/i, patch: { seasons: ["summer"], warmth: 1 } },
  { match: /maglione|dolcevita|lana/i, patch: { seasons: ["autumn", "winter"], warmth: 4 } },
  { match: /felpa|cardigan/i, patch: { seasons: ["spring", "autumn", "winter"], warmth: 3 } },
  { match: /giacca di pelle|trench|giubbotto|blazer/i, patch: { seasons: ["spring", "autumn"], warmth: 3 } },
  { match: /sciarpa|guanti|berretto/i, patch: { seasons: ["autumn", "winter"] } },
  { match: /camicia|blusa/i, patch: { occasions: ["ufficio", "quotidiano"] } },
  { match: /costume|bikini/i, patch: { seasons: ["summer"], occasions: ["sport"] } },
  { match: /stival/i, patch: { seasons: ["autumn", "winter"] } },
  { match: /sandal|infradit/i, patch: { seasons: ["summer"] } },
  { match: /tuta(?! intera)|sportiv/i, patch: { styles: ["sportivo"], occasions: ["sport"] } },
  { match: /pizzo|trasparente/i, patch: { styles: ["elegante", "gothic"], occasions: ["serata"] } },
];

/** Classificazione assistita (locale, deterministica): suggerisce stagioni/stili/occasioni/pesantezza dalla categoria e dal nome. */
export function suggestDefaults(category: WardrobeCategory, name: string): Suggestion {
  let suggestion = { ...CATEGORY_DEFAULTS[category] };
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(name)) suggestion = { ...suggestion, ...rule.patch };
  }
  return suggestion;
}
