import { describe, expect, it } from "vitest";
import { parseImport } from "./chatgpt";
import type { WishlistItem } from "../supabase/types";
import { applyToWishlist } from "../sync/ops";
import { awaitingMetadata, categoriesOf, metadataPatch, missingFromLink, siteName, visibleItems } from "./list";
import { decodeEntities, extractMetadata, missingFields } from "./metadata";
import { formatPrice, parseAmount, parsePrice } from "./price";
import { checkUrl, isPublicAddress } from "./ssrf";

describe("prezzi", () => {
  it("legge importi italiani e inglesi", () => {
    expect(parseAmount("19,90")).toBe(19.9);
    expect(parseAmount("1.299,90")).toBe(1299.9);
    expect(parseAmount("1,299.90")).toBe(1299.9);
    expect(parseAmount("1.299")).toBe(1299);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("25")).toBe(25);
    expect(parseAmount("gratis")).toBeNull();
  });

  it("riconosce valuta e prezzi indicativi", () => {
    expect(parsePrice("19,90 €")).toEqual({ amount: 19.9, currency: "EUR", estimate: false });
    expect(parsePrice("~25€")).toEqual({ amount: 25, currency: "EUR", estimate: true });
    expect(parsePrice("circa 30 euro")).toEqual({ amount: 30, currency: "EUR", estimate: true });
    expect(parsePrice("25-30 €")).toEqual({ amount: 25, currency: "EUR", estimate: true });
    expect(parsePrice("$20")).toEqual({ amount: 20, currency: "USD", estimate: false });
    expect(parsePrice("45")).toEqual({ amount: 45, currency: null, estimate: false });
    expect(parsePrice("da definire")).toBeNull();
  });

  it("scrive il prezzo come lo si legge in Italia", () => {
    expect(formatPrice(19.9, "EUR", false)).toBe("19,90 €");
    expect(formatPrice(25, null, true)).toBe("~ 25 €");
    expect(formatPrice(20, "USD", false)).toBe("20 USD");
    expect(formatPrice(null, "EUR", false)).toBeNull();
  });
});

describe("import da ChatGPT", () => {
  it("legge il formato guidato", () => {
    const rows = parseImport(`Ecco i miei consigli!

Nome | Marca | Categoria | Prezzo indicativo | Nota breve
Siero Vitamina C | The Ordinary | Skincare | ~12 € | Leggero, per la mattina
Crema solare SPF 50 | La Roche-Posay | Solari | 18,90 € | Non unge
Mascara | - | Trucco | | 

Fammi sapere se vuoi altro.`);
    expect(rows).toEqual([
      { name: "Siero Vitamina C", brand: "The Ordinary", category: "Skincare", price_amount: 12, price_currency: "EUR", price_is_estimate: true, notes: "Leggero, per la mattina", recognized: true },
      { name: "Crema solare SPF 50", brand: "La Roche-Posay", category: "Solari", price_amount: 18.9, price_currency: "EUR", price_is_estimate: false, notes: "Non unge", recognized: true },
      { name: "Mascara", brand: null, category: "Trucco", price_amount: null, price_currency: null, price_is_estimate: false, notes: null, recognized: true },
    ]);
  });

  it("accetta una tabella Markdown, con grassetti ed elenco puntato", () => {
    const rows = parseImport(`| Nome | Marca | Categoria | Prezzo indicativo | Nota breve |
|---|---|---|---|---|
| **Balsamo labbra** | Carmex | Labbra | circa 4 € | Classico |
- Detergente | CeraVe | Skincare | 10-12 € | Delicato`);
    expect(rows.map((r) => [r.name, r.brand, r.price_amount, r.price_is_estimate])).toEqual([
      ["Balsamo labbra", "Carmex", 4, true],
      ["Detergente", "CeraVe", 10, true],
    ]);
  });

  it("un prezzo che non si riesce a leggere finisce nella nota", () => {
    const [row] = parseImport("Profumo | Byredo | Profumi | dipende dal formato | Legnoso");
    expect(row.price_amount).toBeNull();
    expect(row.notes).toBe("Legnoso · dipende dal formato");
  });

  it("senza formato guidato prova con gli elenchi", () => {
    const rows = parseImport(`Ti consiglio:
1. **Siero niacinamide** (The Ordinary) – circa 8 €, uniforma l'incarnato
2. Contorno occhi (Kiehl's): idratante
- Tonico esfoliante
Buon acquisto!`);
    expect(rows).toEqual([
      { name: "Siero niacinamide", brand: "The Ordinary", category: null, price_amount: 8, price_currency: "EUR", price_is_estimate: true, notes: "uniforma l'incarnato", recognized: true },
      { name: "Contorno occhi", brand: "Kiehl's", category: null, price_amount: null, price_currency: null, price_is_estimate: false, notes: "idratante", recognized: true },
      { name: "Tonico esfoliante", brand: null, category: null, price_amount: null, price_currency: null, price_is_estimate: false, notes: null, recognized: false },
    ]);
  });

  it("un testo senza prodotti non produce righe", () => {
    expect(parseImport("Certo! Dimmi pure che tipo di pelle hai.")).toEqual([]);
    expect(parseImport("")).toEqual([]);
  });
});

describe("metadati dai link", () => {
  const page = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;

  it("preferisce il JSON-LD Product", () => {
    const html = page(`
      <title>Negozio | Altro titolo</title>
      <meta property="og:title" content="Titolo Open Graph">
      <meta property="og:image" content="https://cdn.example.com/og.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Siero Vitamina C 30 ml","image":["https://cdn.example.com/siero.jpg"],"brand":{"@type":"Brand","name":"The Ordinary"},"offers":{"@type":"Offer","price":"12.50","priceCurrency":"eur"}}]}</script>`);
    expect(extractMetadata(html, "https://shop.example.com/p/1")).toEqual({
      title: "Siero Vitamina C 30 ml",
      image: "https://cdn.example.com/siero.jpg",
      price: 12.5,
      currency: "EUR",
      brand: "The Ordinary",
    });
  });

  it("legge prezzo minimo e immagine come oggetto", () => {
    const html = page(`<script type="application/ld+json">[{"@type":["Product","ItemPage"],"name":"Borsa","image":{"@type":"ImageObject","url":"/img/borsa.jpg"},"offers":[{"@type":"AggregateOffer","lowPrice":89,"priceCurrency":"EUR"}]}]</script>`);
    expect(extractMetadata(html, "https://moda.example.com/borsa")).toMatchObject({ title: "Borsa", image: "https://moda.example.com/img/borsa.jpg", price: 89, currency: "EUR" });
  });

  it("ripiega su Open Graph", () => {
    const html = page(`
      <meta content="Crema &amp; Co. &#8211; Idratante" property="og:title" />
      <meta property='og:image' content='//cdn.example.com/crema.jpg'>
      <meta property="product:price:amount" content="24,90">
      <meta property="product:price:currency" content="EUR">`);
    expect(extractMetadata(html, "https://beauty.example.com/crema")).toEqual({
      title: "Crema & Co. – Idratante",
      image: "https://cdn.example.com/crema.jpg",
      price: 24.9,
      currency: "EUR",
      brand: null,
    });
  });

  it("in mancanza d'altro usa il titolo della pagina e lascia vuoto il resto", () => {
    const meta = extractMetadata(page("<title>\n  Scarpe da corsa  \n</title>"), "https://example.com/x");
    expect(meta).toEqual({ title: "Scarpe da corsa", image: null, price: null, currency: null, brand: null });
    expect(missingFields(meta)).toEqual(["immagine", "prezzo"]);
  });

  it("non inventa nulla da una pagina vuota o da JSON rotto", () => {
    const meta = extractMetadata(page(`<script type="application/ld+json">{non è json</script>`), "https://example.com/x");
    expect(meta).toEqual({ title: null, image: null, price: null, currency: null, brand: null });
    expect(missingFields(meta)).toEqual(["nome", "immagine", "prezzo"]);
  });

  it("scarta le immagini non https e le valute senza prezzo", () => {
    const html = page(`<meta property="og:image" content="http://cdn.example.com/a.jpg"><meta property="product:price:currency" content="EUR">`);
    expect(extractMetadata(html, "https://example.com/x")).toMatchObject({ image: null, currency: null });
  });

  it("decodifica le entità", () => {
    expect(decodeEntities("L&apos;Or&eacute;al &amp; C. &#x20AC;10")).toBe("L'Or&eacute;al & C. €10");
  });
});

describe("protezione SSRF", () => {
  it("accetta solo indirizzi pubblici", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4002:410::200e"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("rifiuta indirizzi privati, locali e riservati", () => {
    const blocked = [
      "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
      "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::a00:1", "2002:7f00:1::", "2001:db8::1",
      "non-un-ip", "999.1.1.1", "1.2.3",
    ];
    for (const ip of blocked) expect(isPublicAddress(ip), ip).toBe(false);
  });

  it("un IPv4 pubblico mappato in IPv6 resta pubblico", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("controlla l'indirizzo prima di qualsiasi richiesta", () => {
    expect(checkUrl("https://www.example.com/prodotto?id=1").ok).toBe(true);
    expect(checkUrl("http://example.com:80/").ok).toBe(true);
    const reason = (u: string) => {
      const r = checkUrl(u);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason("ftp://example.com/x")).toBe("protocol");
    expect(reason("file:///etc/passwd")).toBe("protocol");
    expect(reason("javascript:alert(1)")).toBe("protocol");
    expect(reason("https://utente:segreto@example.com/")).toBe("credentials");
    expect(reason("https://example.com:8443/")).toBe("port");
    expect(reason("http://localhost/")).toBe("host");
    expect(reason("http://app.localhost/")).toBe("host");
    expect(reason("http://127.0.0.1/")).toBe("host");
    expect(reason("http://[::1]/")).toBe("host");
    expect(reason("http://169.254.169.254/latest/meta-data/")).toBe("host");
    expect(reason("http://2130706433/")).toBe("host");
    expect(reason("http://0x7f.0.0.1/")).toBe("host");
    expect(reason("http://servizio.internal/")).toBe("host");
    expect(reason("non un indirizzo")).toBe("invalid");
  });
});

describe("elenco della wishlist", () => {
  const AT = "2026-10-10T08:00:00.000Z";
  const item = (over: Partial<WishlistItem> & { id: string }): WishlistItem =>
    applyToWishlist([], { kind: "insert", table: "wishlist_items", row: { list_id: "l", name: over.id, ...over } }, over.created_at ?? AT)[0];

  const items = [
    item({ id: "siero", category: "Skincare", interest: 3 }),
    item({ id: "borsa", category: "Moda", interest: 2, created_at: "2026-10-09T08:00:00.000Z" }),
    item({ id: "libro", interest: 2, created_at: "2026-10-10T09:00:00.000Z" }),
    item({ id: "presa", category: "Moda", status: "bought" }),
  ];

  it("mostra gli articoli di uno stato, dal più desiderato e poi dal più recente", () => {
    expect(visibleItems(items, "wanted", null).map((i) => i.id)).toEqual(["siero", "libro", "borsa"]);
    expect(visibleItems(items, "wanted", "Moda").map((i) => i.id)).toEqual(["borsa"]);
    expect(visibleItems(items, "bought", null).map((i) => i.id)).toEqual(["presa"]);
  });

  it("elenca le categorie dello stato scelto", () => {
    expect(categoriesOf(items, "wanted")).toEqual(["Moda", "Skincare"]);
    expect(categoriesOf(items, "discarded")).toEqual([]);
  });

  it("un articolo nuovo ha i valori predefiniti e va in testa", () => {
    const next = applyToWishlist(items, { kind: "insert", table: "wishlist_items", row: { id: "nuovo", list_id: "l", name: "Nuovo" } }, "2026-10-11T08:00:00.000Z");
    expect(next[0]).toMatchObject({ id: "nuovo", status: "wanted", interest: 2, source: "manual", price_is_estimate: false });
  });

  const meta = { title: "Siero Vitamina C", image: "https://cdn.example.com/s.jpg", price: 12.5, currency: "EUR", brand: "The Ordinary" };

  it("i dati del link riempiono solo i campi vuoti", () => {
    const fromCapture = item({ id: "x", name: "https://shop.example.com/p/1", url: "https://shop.example.com/p/1" });
    expect(metadataPatch(fromCapture, meta)).toEqual({
      name: "Siero Vitamina C",
      brand: "The Ordinary",
      image_url: "https://cdn.example.com/s.jpg",
      price_amount: 12.5,
      price_currency: "EUR",
      price_is_estimate: false,
    });
    const byHand = item({ id: "y", name: "Il mio siero", brand: "Altra", price_amount: 10, price_currency: "EUR", url: "https://shop.example.com/p/1" });
    expect(metadataPatch(byHand, meta)).toEqual({ image_url: "https://cdn.example.com/s.jpg" });
  });

  it("da una pagina che non dice nulla non cambia nulla", () => {
    const blank = { title: null, image: null, price: null, currency: null, brand: null };
    expect(metadataPatch(item({ id: "x", url: "https://example.com" }), blank)).toEqual({});
  });

  it("dice cosa non è arrivato dal link, solo dopo averlo letto", () => {
    expect(missingFromLink(item({ id: "x", url: "https://example.com" }))).toEqual([]);
    expect(missingFromLink(item({ id: "x", url: "https://example.com", metadata_fetched_at: AT }))).toEqual(["immagine", "prezzo"]);
    expect(missingFromLink(item({ id: "x", url: "https://example.com", metadata_fetched_at: AT, image_url: "https://a/b.jpg", price_amount: 5 }))).toEqual([]);
  });

  it("trova gli articoli con un link ancora da leggere", () => {
    const list = [
      item({ id: "da leggere", url: "https://example.com/a", source: "link" }),
      item({ id: "già letto", url: "https://example.com/b", source: "link", metadata_fetched_at: AT }),
      item({ id: "senza link" }),
    ];
    expect(awaitingMetadata(list).map((i) => i.id)).toEqual(["da leggere"]);
  });

  it("mostra il nome del sito", () => {
    expect(siteName("https://www.sephora.it/p/siero-123.html")).toBe("sephora.it");
    expect(siteName("non un link")).toBeNull();
  });
});
