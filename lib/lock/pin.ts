/**
 * PIN del Log (technical-design.md, 4.2): del PIN si conserva solo un hash PBKDF2 con sale casuale.
 * È una protezione dell'interfaccia, non cifratura dei dati.
 */
const ITERATIONS = 210_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Un PIN valido ha da 4 a 6 cifre. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

/** Formato salvato nel profilo: `pbkdf2$<iterazioni>$<sale>$<hash>`. */
export async function hashPin(pin: string, iterations: number = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return `pbkdf2$${iterations}$${toHex(salt)}$${await derive(pin, salt, iterations)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;
  const candidate = await derive(pin, fromHex(salt), Number(iterations));
  // Confronto a tempo costante.
  let diff = candidate.length ^ hash.length;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  return diff === 0;
}

/** Tentativi sbagliati concessi prima della prima attesa. */
export const FREE_ATTEMPTS = 3;

/**
 * Attesa dopo `failures` PIN sbagliati di fila: nessuna per i primi tre,
 * poi 30 secondi che raddoppiano a ogni errore, fino a 15 minuti.
 */
export function lockoutSeconds(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(15 * 60, 30 * 2 ** (failures - FREE_ATTEMPTS));
}
