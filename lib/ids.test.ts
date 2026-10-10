import { describe, expect, it } from "vitest";
import { deterministicId, uuidv7 } from "./ids";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("è un UUID valido di versione 7, ordinabile nel tempo", () => {
    const a = uuidv7(1_000_000);
    const b = uuidv7(2_000_000);
    expect(a).toMatch(UUID);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
    expect(uuidv7()).not.toBe(uuidv7());
  });
});

describe("deterministicId", () => {
  it("dà sempre lo stesso UUID per lo stesso nome", async () => {
    const a = await deterministicId("r1:2026-10-12");
    expect(a).toMatch(UUID);
    expect(await deterministicId("r1:2026-10-12")).toBe(a);
    expect(await deterministicId("r1:2026-10-19")).not.toBe(a);
  });
});
