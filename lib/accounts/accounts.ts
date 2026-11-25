/**
 * Account e accesso (D76): controlli di email e password, messaggi degli errori di Supabase Auth e della
 * Edge Function `admin-users`, ordine dell'elenco degli account. Puro, senza rete.
 */

export const MIN_PASSWORD = 8;

/** Segno sul profilo (`tours_seen`) che la domanda del nome è già stata fatta: non torna (D70). */
export const NAME_ASKED = "name";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Il problema della password nuova, o null se va bene. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Almeno ${MIN_PASSWORD} caratteri.`;
  if (password.trim() === "") return "La password non può essere fatta solo di spazi.";
  if (password !== confirm) return "Le due password non coincidono.";
  return null;
}

/** Al primo accesso l'app chiede come chiamare la persona: solo se il nome manca e non l'ha già chiesto. */
export function needsName(displayName: string | null | undefined, seen: readonly string[] | null | undefined): boolean {
  return !displayName?.trim() && !seen?.includes(NAME_ASKED);
}

/** Messaggio in italiano per un errore di Supabase Auth (accesso, codice, password). */
export function authErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("banned")) return "Questo account è stato disattivato. Chiedi a chi gestisce l'app.";
  if (m.includes("rate") || m.includes("security purposes")) return "Troppi tentativi. Aspetta un minuto e riprova.";
  if (m.includes("invalid login credentials")) return "Email o password non corrette. Se non hai ancora una password, usa «Primo accesso o password dimenticata».";
  if (m.includes("signups not allowed") || m.includes("not allowed") || m.includes("user not found")) {
    return "Questa email non è abilitata. Chiedi a chi gestisce l'app di aggiungerla.";
  }
  if (m.includes("expired") || m.includes("invalid")) return "Codice non valido o scaduto. Richiedine uno nuovo.";
  if (m.includes("different from the old") || (m.includes("same") && m.includes("password"))) return "La nuova password deve essere diversa da quella di prima.";
  if (m.includes("weak") || m.includes("password should")) return `Password troppo debole: usa almeno ${MIN_PASSWORD} caratteri, meglio se lettere e numeri.`;
  if (m.includes("reauthentication")) return "Per sicurezza esci, rientra con un codice e poi cambia la password.";
  return "Qualcosa non ha funzionato. Riprova tra poco.";
}

export type AdminErrorCode = "invalid_email" | "already_exists" | "not_allowed" | "not_found" | "network" | "other";

export function adminErrorMessage(code: AdminErrorCode): string {
  switch (code) {
    case "invalid_email":
      return "Questa email non sembra valida.";
    case "already_exists":
      return "Questa email ha già un account.";
    case "not_allowed":
      return "Questo account non si può modificare da qui.";
    case "not_found":
      return "Questo account non esiste più.";
    case "network":
      return "Serve la connessione. Non è cambiato nulla.";
    default:
      return "Qualcosa non ha funzionato. Non è cambiato nulla.";
  }
}

export function toAdminErrorCode(raw: string | undefined): AdminErrorCode {
  return raw === "invalid_email" || raw === "already_exists" || raw === "not_allowed" || raw === "not_found" ? raw : "other";
}

export type ManagedAccount = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
  admin: boolean;
  self: boolean;
};

/** Prima il proprio account, poi gli attivi, poi i disattivati; dentro ogni gruppo per email. */
export function sortAccounts(accounts: readonly ManagedAccount[]): ManagedAccount[] {
  const rank = (a: ManagedAccount) => (a.self ? 0 : a.disabled ? 2 : 1);
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email, "it"));
}

/** "Nessun accesso finora" o la data dell'ultimo accesso, in italiano. */
export function lastSignInLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Nessun accesso finora";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return `Ultimo accesso: ${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}`;
}

/** Si possono disattivare ed eliminare solo gli account altrui che non amministrano. */
export function canManage(account: ManagedAccount): boolean {
  return !account.self && !account.admin;
}
