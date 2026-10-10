import { parsePrice } from "./price";

/** La frase da aggiungere alla richiesta a ChatGPT (Product Definition 7.6). */
export const GUIDED_PROMPT =
  "Alla fine, elenca i prodotti uno per riga in questo formato: Nome | Marca | Categoria | Prezzo indicativo | Nota breve";

export type ImportRow = {
  name: string;
  brand: string | null;
  category: string | null;
  price_amount: number | null;
  price_currency: string | null;
  price_is_estimate: boolean;
  notes: string | null;
  /** Falso quando la riga non segue il formato: resta come testo da sistemare a mano. */
  recognized: boolean;
};

function cell(text: string | undefined): string | null {
  const clean = (text ?? "").replace(/\*\*|__|`/g, "").trim();
  return clean && !/^[-–—]+$/.test(clean) && !/^(n\/?[ad]|nd|nessun[ao]?)$/i.test(clean) ? clean : null;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim();
}

const HEADER = /^nome\s*\|\s*marca/i;
const SEPARATOR = /^\|?\s*:?-{2,}/;

function fromPipes(line: string): ImportRow | null {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  const name = cell(cells[0]);
  if (!name) return null;
  const price = parsePrice(cells[3] ?? "");
  return {
    name,
    brand: cell(cells[1]),
    category: cell(cells[2]),
    price_amount: price?.amount ?? null,
    price_currency: price ? (price.currency ?? "EUR") : null,
    price_is_estimate: price?.estimate ?? false,
    // Un prezzo che non si riesce a leggere resta scritto nella nota, non si perde.
    notes: [cell(cells[4]), !price ? cell(cells[3]) : null, ...cells.slice(5).map(cell)].filter(Boolean).join(" · ") || null,
    recognized: true,
  };
}

/** "Siero vitamina C (The Ordinary) – ~12 €: leggero" e simili: si prova a leggere marca, prezzo e nota. */
function fromFreeText(line: string): ImportRow {
  const base = { brand: null, category: null, price_amount: null, price_currency: null, price_is_estimate: false, notes: null };
  const plainLine = line.replace(/\*\*|__/g, "").trim();
  const split = plainLine.split(/\s+[–—-]\s+|:\s+/);
  const head = (cell(split[0]) ?? plainLine).trim();
  const rest = split.slice(1).join(" – ").trim();
  if (!rest && !/\(.+\)/.test(head)) {
    return { ...base, name: head, recognized: false };
  }
  const brandMatch = head.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const priceText = rest.match(/(?:[~≈]|circa\s+)?\s*(?:€\s*)?\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?\s*(?:€|euro|eur)?/i);
  const price = priceText && /€|euro|eur/i.test(priceText[0]) ? parsePrice(priceText[0]) : null;
  const note = price && priceText ? rest.replace(priceText[0], "").replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "") : rest;
  return {
    name: brandMatch ? brandMatch[1].trim() : head,
    brand: brandMatch ? brandMatch[2].trim() : null,
    category: null,
    price_amount: price?.amount ?? null,
    price_currency: price ? (price.currency ?? "EUR") : null,
    price_is_estimate: price?.estimate ?? false,
    notes: note || null,
    recognized: true,
  };
}

/**
 * Legge il testo incollato da ChatGPT. Le righe `Nome | Marca | Categoria | Prezzo | Nota` sono riconosciute
 * in pieno; gli elenchi puntati o numerati alla meglio; il resto resta come testo modificabile.
 * Se nel testo c'è almeno una riga con le barre, le frasi senza barre sono commento e si saltano.
 */
export function parseImport(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hasPipes = lines.some((l) => l.includes("|") && !SEPARATOR.test(l));
  const rows: ImportRow[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line || SEPARATOR.test(line) || HEADER.test(line.replace(/^\|/, "").trim())) continue;
    if (line.includes("|")) {
      const row = fromPipes(line);
      if (row) rows.push(row);
    } else if (!hasPipes) {
      // Senza formato guidato valgono solo le voci di un elenco: le frasi sciolte sono commento.
      if (raw !== line) rows.push(fromFreeText(line));
    }
  }
  return rows;
}
