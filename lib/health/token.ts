/** Prefisso che fa riconoscere a colpo d'occhio un token del planner. */
const PREFIX = "lp_";

/** Token personale per il Comando rapido: 32 byte casuali. Si mostra una volta sola. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return PREFIX + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Impronta SHA-256 (esadecimale): è l'unica cosa che si conserva del token. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Scarta subito ciò che non può essere un token, prima di cercarlo nel database. */
export function looksLikeToken(token: string): boolean {
  return /^lp_[A-Za-z0-9_-]{43}$/.test(token);
}
