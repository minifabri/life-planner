import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, lockoutSeconds, verifyPin } from "./pin";

describe("PIN del Log", () => {
  it("accetta solo da 4 a 6 cifre", () => {
    expect(["1234", "12345", "123456"].every(isValidPin)).toBe(true);
    expect(["123", "1234567", "12a4", "", " 1234"].some(isValidPin)).toBe(false);
  });

  it("verifica il PIN giusto e rifiuta quello sbagliato", async () => {
    const stored = await hashPin("4821", 1000);
    expect(stored).toMatch(/^pbkdf2\$1000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPin("4821", stored)).toBe(true);
    expect(await verifyPin("4822", stored)).toBe(false);
  });

  it("lo stesso PIN dà ogni volta un hash diverso (sale casuale)", async () => {
    expect(await hashPin("4821", 1000)).not.toBe(await hashPin("4821", 1000));
  });

  it("un valore salvato non valido non sblocca nulla", async () => {
    expect(await verifyPin("1234", "")).toBe(false);
    expect(await verifyPin("1234", "md5$abc")).toBe(false);
  });

  it("dopo tre errori si aspetta, ogni volta il doppio, fino a 15 minuti", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(lockoutSeconds)).toEqual([0, 0, 0, 30, 60, 120, 240]);
    expect(lockoutSeconds(20)).toBe(900);
  });
});
