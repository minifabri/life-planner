import { describe, expect, it } from "vitest";
import { localDateString, todayHeading } from "./today";

describe("localDateString", () => {
  it("usa il fuso di Roma anche quando in UTC è ancora il giorno prima", () => {
    // 23:30 UTC dell'8 ottobre = 01:30 del 9 ottobre a Roma (CEST)
    expect(localDateString(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
  });

  it("gestisce il cambio dall'ora legale a quella solare", () => {
    // 25 ottobre 2026: alle 03:00 CEST si torna alle 02:00 CET
    expect(localDateString(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(localDateString(new Date("2026-10-25T23:01:00Z"))).toBe("2026-10-26");
  });
});

describe("todayHeading", () => {
  it("formatta l'intestazione in italiano", () => {
    const h = todayHeading(new Date("2026-10-09T08:00:00Z"));
    expect(h.weekday).toBe("Venerdì");
    expect(h.dayMonth).toBe("9 ott");
    expect(h.week).toBe(41);
  });
});
