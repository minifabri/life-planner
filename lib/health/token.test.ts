import { describe, expect, it } from "vitest";
import { generateToken, hashToken, looksLikeToken } from "./token";

describe("token personale", () => {
  it("è casuale e ha la forma attesa", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(looksLikeToken("lp_corto")).toBe(false);
    expect(looksLikeToken(`${a} `)).toBe(false);
  });

  it("l'impronta è lo SHA-256 esadecimale", async () => {
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
