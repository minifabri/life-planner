/**
 * Protezione SSRF per il recupero dei link (technical-design.md, 9.3):
 * il server deve poter raggiungere solo indirizzi pubblici di Internet.
 */

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPublicIpv4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false; // "questa rete", privata, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local e metadati dei cloud
  if (a === 172 && b >= 16 && b <= 31) return false; // privata
  if (a === 192 && b === 168) return false; // privata
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocolli IETF, documentazione
  if (a === 198 && (b === 18 || b === 19)) return false; // test di rete
  if (a === 198 && b === 51 && c === 100) return false; // documentazione
  if (a === 203 && b === 0 && c === 113) return false; // documentazione
  if (a >= 224) return false; // multicast, riservati, broadcast
  return true;
}

/** Espande un IPv6 in otto gruppi da 16 bit, o null se non è valido. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    text = text.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : -1));
  return nums.length === 8 && nums.every((n) => n >= 0) ? nums : null;
}

function isPublicIpv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return false;
  const embedded = () => isPublicIpv4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  if (g.slice(0, 5).every((n) => n === 0)) {
    // ::, ::1, indirizzi IPv4 mappati (::ffff:a.b.c.d) o compatibili: vale la regola dell'IPv4 contenuto.
    if (g[5] === 0xffff || g[5] === 0) return (g[5] === 0xffff || g[6] !== 0 || g[7] > 1) && embedded();
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return embedded(); // NAT64
  if (g[0] === 0x2002) return isPublicIpv4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // locali uniche
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentazione
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  // Solo unicast globale (2000::/3).
  return (g[0] & 0xe000) === 0x2000;
}

/** Vero solo per un indirizzo IP pubblico di Internet. Qualsiasi cosa non riconosciuta è rifiutata. */
export function isPublicAddress(ip: string): boolean {
  return ip.includes(":") ? isPublicIpv6(ip) : isPublicIpv4(ip);
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: "invalid" | "protocol" | "credentials" | "port" | "host" };

/** Controlli sull'indirizzo prima di qualsiasi richiesta: solo http/https, porte standard, niente credenziali né host interni. */
export function checkUrl(input: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "protocol" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "port" };
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "host" };
  }
  // Un indirizzo IP scritto direttamente deve essere pubblico; i nomi si controllano alla risoluzione DNS.
  const literal = host.includes(":") || /^\d+(\.\d+){3}$/.test(host) || /^[\d.]+$/.test(host) || /^0x/i.test(host);
  if (literal && !isPublicAddress(host)) return { ok: false, reason: "host" };
  return { ok: true, url };
}
