import { describe, expect, it } from "vitest";
import { activeSeasons, splitBySeason } from "./season";

const item = (id: string, seasons: string[]) => ({ id, seasons });

describe("activeSeasons", () => {
  it("nel pieno della stagione vale solo quella", () => {
    expect(activeSeasons("2026-10-16")).toEqual(["autumn"]);
    expect(activeSeasons("2026-07-20")).toEqual(["summer"]);
  });

  it("a cavallo del cambio vale anche la stagione vicina", () => {
    expect(activeSeasons("2026-09-05")).toEqual(["summer", "autumn"]);
    expect(activeSeasons("2026-11-25")).toEqual(["autumn", "winter"]);
    expect(activeSeasons("2026-12-31")).toEqual(["winter"]);
  });
});

describe("splitBySeason", () => {
  it("a ottobre la canotta estiva va tra i capi fuori stagione, senza sparire", () => {
    const items = [item("canotta", ["summer"]), item("maglione", ["autumn", "winter"]), item("jeans", []), item("cappotto", ["winter"])];
    const { current, other } = splitBySeason(items, "2026-10-16");
    expect(current.map((i) => i.id)).toEqual(["maglione", "jeans"]);
    expect(other.map((i) => i.id)).toEqual(["canotta", "cappotto"]);
  });

  it("a fine novembre il cappotto è già di stagione", () => {
    const { current } = splitBySeason([item("cappotto", ["winter"])], "2026-11-25");
    expect(current.map((i) => i.id)).toEqual(["cappotto"]);
  });
});
