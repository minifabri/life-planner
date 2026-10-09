/**
 * Spike S2: verifica locale con Face ID / Touch ID tramite WebAuthn.
 * Nessun server: la credenziale serve solo come "chiave" per sbloccare l'interfaccia del Log.
 * È una protezione dell'interfaccia, non cifratura (technical-design.md, 4.2).
 */
const STORAGE_KEY = "planner-lock-credential";

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasLockCredential(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export async function registerLock(userId: string, email: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Planner", id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: email, displayName: email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Nessuna credenziale creata");
  localStorage.setItem(STORAGE_KEY, toB64(cred.rawId));
}

export async function verifyLock(): Promise<boolean> {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id) throw new Error("Nessuna credenziale registrata");
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: fromB64(id) }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) return false;
  const data = (assertion.response as AuthenticatorAssertionResponse).authenticatorData;
  // Byte 32 = flag; bit 2 (0x04) = user verified
  const flags = new Uint8Array(data)[32];
  return (flags & 0x04) === 0x04;
}

export function forgetLock() {
  localStorage.removeItem(STORAGE_KEY);
}
