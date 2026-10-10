import { parseAmount } from "./price";

/** Ciò che una pagina prodotto dichiara di sé. I campi assenti restano null: mai valori inventati (D22). */
export type LinkMetadata = {
  title: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  brand: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all);
}

function clean(text: unknown): string | null {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const value = decodeEntities(String(text)).replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 300) : null;
}

/** Tutti i tag <meta> con `property` o `name`, in minuscolo. Vale il primo valore non vuoto. */
function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const key = attr("property") ?? attr("name") ?? attr("itemprop");
    const content = attr("content");
    if (!key || !content) continue;
    const k = (key[1] ?? key[2] ?? key[3]).toLowerCase();
    const v = content[1] ?? content[2] ?? content[3] ?? "";
    if (v && !tags.has(k)) tags.set(k, v);
  }
  return tags;
}

type Json = Record<string, unknown>;

function isType(node: Json, type: string): boolean {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/** Cerca il primo nodo `Product` nei blocchi JSON-LD, anche dentro `@graph` o in un elenco. */
function findProduct(html: string): Json | null {
  const blocks = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    for (let i = 0; i < queue.length && i < 200; i++) {
      const node = queue[i];
      if (Array.isArray(node)) queue.push(...node);
      else if (node && typeof node === "object") {
        const json = node as Json;
        if (isType(json, "Product")) return json;
        if (json["@graph"]) queue.push(json["@graph"]);
        if (json.mainEntity) queue.push(json.mainEntity);
      }
    }
  }
  return null;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function offerPrice(product: Json): { price: number | null; currency: string | null } {
  const offer = firstOf(product.offers) as Json | undefined;
  if (!offer || typeof offer !== "object") return { price: null, currency: null };
  const spec = firstOf(offer.priceSpecification) as Json | undefined;
  const raw = offer.price ?? offer.lowPrice ?? spec?.price;
  // Nei dati strutturati il prezzo è un numero con il punto come separatore dei decimali.
  const price = typeof raw === "number" ? raw : typeof raw === "string" ? (/^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : parseAmount(raw)) : null;
  const currency = clean(offer.priceCurrency ?? spec?.priceCurrency);
  return { price: price && price > 0 ? Math.round(price * 100) / 100 : null, currency: currency ? currency.toUpperCase().slice(0, 3) : null };
}

/** Solo immagini https: le altre verrebbero bloccate dal browser. */
function absoluteImage(value: unknown, baseUrl: string): string | null {
  const first = firstOf(value);
  const raw = typeof first === "string" ? first : first && typeof first === "object" ? ((first as Json).url ?? (first as Json).contentUrl) : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(decodeEntities(raw.trim()), baseUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Legge i metadati di una pagina prodotto, in ordine di affidabilità:
 * JSON-LD `Product`, poi Open Graph, poi il `<title>` (technical-design.md, 9.3).
 */
export function extractMetadata(html: string, baseUrl: string): LinkMetadata {
  const product = findProduct(html);
  const meta = metaTags(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const fromOffer = product ? offerPrice(product) : { price: null, currency: null };
  const metaPrice = meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price");
  const brandNode = product ? firstOf(product.brand) : null;

  const price = fromOffer.price ?? (metaPrice ? parseAmount(metaPrice.includes(",") ? metaPrice : metaPrice.replace(/[^\d.]/g, "")) : null);
  const currency = fromOffer.currency ?? clean(meta.get("product:price:currency") ?? meta.get("og:price:currency") ?? meta.get("pricecurrency"))?.toUpperCase().slice(0, 3) ?? null;

  return {
    title: clean(product?.name) ?? clean(meta.get("og:title")) ?? clean(meta.get("twitter:title")) ?? clean(titleTag),
    image: absoluteImage(product?.image, baseUrl) ?? absoluteImage(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image"), baseUrl),
    price,
    // Una valuta senza prezzo non serve a nulla.
    currency: price !== null ? currency : null,
    brand: clean(typeof brandNode === "string" ? brandNode : (brandNode as Json | null)?.name) ?? clean(meta.get("product:brand")),
  };
}

const LABELS: Record<"title" | "image" | "price", string> = { title: "nome", image: "immagine", price: "prezzo" };

/** Cosa non è arrivato dal link, da dire con chiarezza nell'interfaccia. */
export function missingFields(meta: Pick<LinkMetadata, "title" | "image" | "price">): string[] {
  return (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((k) => meta[k] === null).map((k) => LABELS[k]);
}

/** Risposta di `/api/link-preview`. */
export type LinkPreviewReply =
  | { ok: true; metadata: LinkMetadata; missing: string[] }
  | { ok: false; reason: "unauthorized" | "invalid" | "blocked" | "unreachable" | "not_html" | "http_error" };

/** Perché un link non ha dato nulla, detto in modo che si capisca cosa fare. */
export function failureMessage(reason: Extract<LinkPreviewReply, { ok: false }>["reason"]): string {
  if (reason === "invalid" || reason === "blocked") return "Questo indirizzo non si può leggere. Controlla il link.";
  if (reason === "http_error") return "Il sito non lascia leggere la pagina. Il link resta salvato: completa i dati a mano.";
  if (reason === "not_html") return "Il link non porta a una pagina web.";
  if (reason === "unauthorized") return "Sessione scaduta: riapri l'app e riprova.";
  return "Il sito non risponde. Il link resta salvato: riprova più tardi.";
}
