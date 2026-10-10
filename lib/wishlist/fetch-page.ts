import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { checkUrl, isPublicAddress } from "./ssrf";

/**
 * Scarica una pagina pubblica per leggerne i metadati (technical-design.md, 9.3). Solo lato server.
 * Limiti: 5 secondi in tutto, 1,5 MB letti, al massimo 3 redirect, ognuno ricontrollato.
 */
const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "PlannerLinkPreview/1.0 (app personale; legge titolo, immagine e prezzo di una pagina prodotto)";

export type PageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: "invalid" | "blocked" | "unreachable" | "not_html" | "http_error"; status?: number };

class BlockedAddressError extends Error {}

/**
 * Risoluzione DNS usata dalla connessione stessa: l'indirizzo che si controlla è quello a cui ci si collega,
 * quindi un nome che cambia risposta tra il controllo e la richiesta (DNS rebinding) non passa.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedAddressError(`Indirizzo non pubblico per ${hostname}`), "", 0);
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

type Raw = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

function requestOnce(url: URL, deadline: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        lookup: publicOnlyLookup,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        // Di un redirect o di un errore il corpo non serve.
        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({ status, headers: response.headers, body: Buffer.alloc(0) });
        }
        const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip" || encoding === "x-gzip"
            ? response.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? response.pipe(zlib.createInflate())
              : encoding === "br"
                ? response.pipe(zlib.createBrotliDecompress())
                : response;
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) });
        stream.on("data", (chunk: Buffer) => {
          const room = MAX_BYTES - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          // Raggiunto il limite si smette di leggere: i metadati stanno all'inizio della pagina.
          if (size >= MAX_BYTES) {
            request.destroy();
            finish();
          }
        });
        stream.on("end", finish);
        // Un flusso compresso interrotto dal limite o dal server: si tiene ciò che è arrivato.
        stream.on("error", () => (size > 0 ? finish() : reject(new Error("Risposta illeggibile"))));
      },
    );
    request.setTimeout(Math.max(1, deadline - Date.now()), () => request.destroy(new Error("Tempo scaduto")));
    request.on("error", reject);
    request.end();
  });
}

function decode(body: Buffer, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export async function fetchPage(input: string): Promise<PageResult> {
  const first = checkUrl(input);
  if (!first.ok) return { ok: false, reason: first.reason === "invalid" || first.reason === "protocol" ? "invalid" : "blocked" };
  const deadline = Date.now() + TIMEOUT_MS;
  let url = first.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let raw: Raw;
    try {
      raw = await requestOnce(url, deadline);
    } catch (error) {
      return { ok: false, reason: error instanceof BlockedAddressError ? "blocked" : "unreachable" };
    }
    if (raw.status >= 300 && raw.status < 400 && raw.headers.location) {
      let next: URL;
      try {
        next = new URL(raw.headers.location, url);
      } catch {
        return { ok: false, reason: "unreachable" };
      }
      const checked = checkUrl(next.href);
      if (!checked.ok) return { ok: false, reason: "blocked" };
      url = checked.url;
      continue;
    }
    if (raw.status < 200 || raw.status >= 300) return { ok: false, reason: "http_error", status: raw.status };
    const contentType = String(raw.headers["content-type"] ?? "");
    if (contentType && !/html|xml/i.test(contentType)) return { ok: false, reason: "not_html" };
    return { ok: true, html: decode(raw.body, contentType), finalUrl: url.href };
  }
  return { ok: false, reason: "unreachable" };
}
