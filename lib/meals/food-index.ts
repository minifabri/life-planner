import { normalizeName } from "../shopping/entry";
import { stem } from "./ingredients";

/**
 * Indice di alimenti per riconoscere ciò che il nome di un piatto porta con sé (nutrienti, micronutrienti).
 * Ogni voce è un elenco di alimenti separati da virgola, con i valori che portano. Singolare e plurale
 * coincidono; "=" davanti vuol dire parola esatta, dove la radice confonderebbe ("pesce" e "pesca");
 * due parole valgono insieme ("frutta secca", "fiocchi di latte"). Un alimento in più voci le somma.
 */
export function foodIndex<T>(entries: [T[], string][]): (name: string) => Set<T> {
  const byStem = new Map<string, T[]>();
  const byWord = new Map<string, T[]>();

  for (const [values, foods] of entries) {
    for (const food of foods.split(", ")) {
      const [map, key] = food.startsWith("=") ? [byWord, food.slice(1)] : [byStem, food.split(" ").map(stem).join(" ")];
      map.set(key, [...(map.get(key) ?? []), ...values]);
    }
  }

  return (name) => {
    const raw = normalizeName(name).split(/[^a-z0-9]+/).filter(Boolean);
    const stems = raw.map(stem);
    const found = new Set<T>();
    for (let i = 0; i < raw.length; i++) {
      // Due parole insieme, anche con una preposizione in mezzo: "fiocchi di latte", "frutti di bosco".
      const pair = [1, 2].map((gap) => i + gap).find((j) => j < raw.length && byStem.has(`${stems[i]} ${stems[j]}`));
      const hit = pair !== undefined ? byStem.get(`${stems[i]} ${stems[pair]}`) : (byWord.get(raw[i]) ?? byStem.get(stems[i]));
      hit?.forEach((v) => found.add(v));
      if (pair !== undefined) i = pair;
    }
    return found;
  };
}
