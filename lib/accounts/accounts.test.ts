import { describe, expect, it } from "vitest";
import {
  adminErrorMessage,
  authErrorMessage,
  canManage,
  isValidEmail,
  lastSignInLabel,
  needsName,
  normalizeEmail,
  passwordProblem,
  sortAccounts,
  toAdminErrorCode,
  type ManagedAccount,
} from "./accounts";

const account = (over: Partial<ManagedAccount>): ManagedAccount => ({
  id: "x",
  email: "a@esempio.it",
  created_at: "2026-11-01T10:00:00Z",
  last_sign_in_at: null,
  disabled: false,
  admin: false,
  self: false,
  ...over,
});

describe("email", () => {
  it("normalizza e controlla", () => {
    expect(normalizeEmail("  Nome@Esempio.IT ")).toBe("nome@esempio.it");
    expect(isValidEmail("nome@esempio.it")).toBe(true);
    expect(isValidEmail(" Nome@Esempio.it ")).toBe(true);
    expect(isValidEmail("nome@esempio")).toBe(false);
    expect(isValidEmail("nome esempio@x.it")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("chiede almeno 8 caratteri", () => {
    expect(passwordProblem("corta", "corta")).toBe("Almeno 8 caratteri.");
  });
  it("rifiuta solo spazi", () => {
    expect(passwordProblem("        ", "        ")).toMatch(/spazi/);
  });
  it("vuole due password uguali", () => {
    expect(passwordProblem("lunghissima1", "lunghissima2")).toMatch(/coincidono/);
  });
  it("accetta una password valida", () => {
    expect(passwordProblem("lunghissima1", "lunghissima1")).toBeNull();
  });
});

describe("needsName", () => {
  it("chiede il nome solo se manca e non l'ha già chiesto", () => {
    expect(needsName(null, [])).toBe(true);
    expect(needsName("  ", ["intro"])).toBe(true);
    expect(needsName("Bibi", [])).toBe(false);
    expect(needsName(null, ["name"])).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("traduce gli errori di Supabase Auth", () => {
    expect(authErrorMessage("User is banned")).toMatch(/disattivato/);
    expect(authErrorMessage("Invalid login credentials")).toMatch(/Email o password/);
    expect(authErrorMessage("Signups not allowed for otp")).toMatch(/non è abilitata/);
    expect(authErrorMessage("Token has expired or is invalid")).toMatch(/Codice non valido/);
    expect(authErrorMessage("For security purposes, you can only request this after 30 seconds.")).toMatch(/Troppi tentativi/);
    expect(authErrorMessage("New password should be different from the old password.")).toMatch(/diversa/);
    expect(authErrorMessage("Password should be at least 8 characters.")).toMatch(/debole/);
    expect(authErrorMessage("boom")).toMatch(/Riprova/);
  });
});

describe("errori di admin-users", () => {
  it("riconosce i codici noti", () => {
    expect(toAdminErrorCode("already_exists")).toBe("already_exists");
    expect(toAdminErrorCode("errore")).toBe("other");
    expect(toAdminErrorCode(undefined)).toBe("other");
    expect(adminErrorMessage("already_exists")).toBe("Questa email ha già un account.");
  });
});

describe("elenco degli account", () => {
  it("mette prima il proprio, poi gli attivi, poi i disattivati", () => {
    const sorted = sortAccounts([
      account({ id: "3", email: "c@x.it", disabled: true }),
      account({ id: "2", email: "b@x.it" }),
      account({ id: "1", email: "z@x.it", self: true, admin: true }),
      account({ id: "4", email: "a@x.it" }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["1", "4", "2", "3"]);
  });
  it("non lascia gestire sé stessi né chi amministra", () => {
    expect(canManage(account({}))).toBe(true);
    expect(canManage(account({ self: true }))).toBe(false);
    expect(canManage(account({ admin: true }))).toBe(false);
  });
  it("dice dell'ultimo accesso", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(lastSignInLabel(null, now)).toBe("Nessun accesso finora");
    expect(lastSignInLabel("2026-11-19T10:00:00Z", now)).toBe("Ultimo accesso: 19 nov");
    expect(lastSignInLabel("2025-10-09T10:00:00Z", now)).toBe("Ultimo accesso: 9 ott 2025");
  });
});
