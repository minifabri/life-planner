import { describe, expect, it } from "vitest";
import {
  addDays,
  atLocalTime,
  diffDays,
  dueLabel,
  endOfMonth,
  endOfWeek,
  formatDuration,
  isoWeekday,
  localTimeString,
  nextWeekday,
  relativeDay,
  startOfLocalDay,
} from "./local";

describe("date locali", () => {
  it("somma e sottrae giorni attraverso mesi, anni e cambio dell'ora", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-26", "2026-10-24")).toBe(2);
  });

  it("calcola i giorni della settimana", () => {
    expect(isoWeekday("2026-10-10")).toBe(6);
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(nextWeekday("2026-10-10", 1)).toBe("2026-10-12");
    expect(nextWeekday("2026-10-12", 1)).toBe("2026-10-19");
    expect(endOfWeek("2026-10-10")).toBe("2026-10-11");
    expect(endOfWeek("2026-10-11")).toBe("2026-10-11");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("descrive le date rispetto a oggi", () => {
    expect(relativeDay("2026-10-10", "2026-10-10")).toBe("oggi");
    expect(relativeDay("2026-10-11", "2026-10-10")).toBe("domani");
    expect(relativeDay("2026-10-09", "2026-10-10")).toBe("ieri");
    expect(relativeDay("2026-10-14", "2026-10-10")).toBe("mercoledì");
    expect(relativeDay("2026-10-20", "2026-10-10")).toBe("20 ott");
    expect(relativeDay("2026-10-05", "2026-10-10")).toBe("5 ott");
  });

  it("descrive le finestre", () => {
    expect(dueLabel("2026-10-11", "2026-10-10")).toBe("entro domani");
    expect(dueLabel("2026-10-18", "2026-10-13")).toBe("entro domenica");
    expect(dueLabel("2026-10-31", "2026-10-10")).toBe("entro fine mese");
    expect(dueLabel("2026-10-20", "2026-10-10")).toBe("entro il 20 ott");
  });
});

describe("istanti e fusi", () => {
  it("trova l'inizio del giorno a Roma in ora legale e solare", () => {
    expect(startOfLocalDay("2026-10-10", "Europe/Rome").toISOString()).toBe("2026-10-09T22:00:00.000Z");
    expect(startOfLocalDay("2026-11-10", "Europe/Rome").toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });

  it("converte ora locale e istante nei due versi", () => {
    const instant = atLocalTime("2026-10-10", "17:00", "Europe/Rome");
    expect(instant.toISOString()).toBe("2026-10-10T15:00:00.000Z");
    expect(localTimeString(instant, "Europe/Rome")).toBe("17:00");
  });
});

describe("formatDuration", () => {
  it("usa minuti e ore", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30");
  });
});
