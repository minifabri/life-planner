import { describe, expect, it } from "vitest";
import type { Recurrence } from "../supabase/types";
import { datesToMaterialize, nextAfterCompletion, occurrenceDates } from "./expand";
import { describeAfterCompletion, describeRRule, parseRRule, toRRule } from "./rule";

describe("RRULE semplici", () => {
  it("scrive e rilegge le regole dell'interfaccia", () => {
    expect(toRRule({ freq: "daily", interval: 1 })).toBe("FREQ=DAILY");
    expect(toRRule({ freq: "weekly", interval: 2, byDay: [4, 1] })).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH");
    expect(parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH")).toEqual({ freq: "weekly", interval: 2, byDay: [1, 4] });
    expect(parseRRule("RRULE:FREQ=MONTHLY")).toEqual({ freq: "monthly", interval: 1 });
  });

  it("legge e scrive la fine della serie", () => {
    expect(toRRule({ freq: "weekly", interval: 1, byDay: [1], until: "2026-12-14" })).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261214T235959Z");
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261214T235959Z")).toEqual({ freq: "weekly", interval: 1, byDay: [1], until: "2026-12-14" });
    expect(parseRRule("FREQ=DAILY;UNTIL=20261214")).toEqual({ freq: "daily", interval: 1, until: "2026-12-14" });
    expect(parseRRule("FREQ=DAILY;UNTIL=domani")).toBeNull();
    expect(describeRRule("FREQ=MONTHLY;UNTIL=20261214T235959Z")).toBe("Ogni mese, fino al 14 dic 2026");
  });

  it("non interpreta regole che non sa mostrare", () => {
    expect(parseRRule("FREQ=YEARLY")).toBeNull();
    expect(parseRRule("FREQ=MONTHLY;BYDAY=1MO")).toBeNull();
    expect(parseRRule("FREQ=DAILY;COUNT=5")).toBeNull();
  });

  it("le descrive in italiano", () => {
    expect(describeRRule("FREQ=DAILY")).toBe("Ogni giorno");
    expect(describeRRule("FREQ=WEEKLY;BYDAY=MO")).toBe("Ogni lunedì");
    expect(describeRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("Ogni lunedì, mercoledì e venerdì");
    expect(describeRRule("FREQ=WEEKLY;INTERVAL=2")).toBe("Ogni 2 settimane");
    expect(describeRRule("FREQ=MONTHLY")).toBe("Ogni mese");
    expect(describeRRule("FREQ=YEARLY")).toBe("Si ripete");
    expect(describeAfterCompletion(30)).toBe("30 giorni dopo il completamento");
  });
});

describe("occurrenceDates", () => {
  it("espande una regola settimanale nell'intervallo, estremi inclusi", () => {
    expect(occurrenceDates("FREQ=WEEKLY;BYDAY=MO", "2026-10-05", "2026-10-12", "2026-10-26")).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
  });

  it("non perde né duplica giorni al cambio dell'ora (25 ottobre 2026)", () => {
    expect(occurrenceDates("FREQ=DAILY", "2026-10-20", "2026-10-24", "2026-10-27")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("rispetta l'intervallo e il giorno del mese", () => {
    expect(occurrenceDates("FREQ=WEEKLY;INTERVAL=2", "2026-10-06", "2026-10-06", "2026-11-05")).toEqual([
      "2026-10-06",
      "2026-10-20",
      "2026-11-03",
    ]);
    expect(occurrenceDates("FREQ=MONTHLY", "2026-10-15", "2026-10-16", "2026-12-31")).toEqual([
      "2026-11-15",
      "2026-12-15",
    ]);
  });

  it("include l'ultimo giorno della serie e si ferma lì", () => {
    const rrule = toRRule({ freq: "weekly", interval: 1, byDay: [1], until: "2026-10-19" });
    expect(occurrenceDates(rrule, "2026-10-05", "2026-10-01", "2026-11-30")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("non restituisce nulla prima dell'inizio", () => {
    expect(occurrenceDates("FREQ=DAILY", "2026-10-20", "2026-10-01", "2026-10-10")).toEqual([]);
  });
});

function recurrence(over: Partial<Recurrence> = {}): Recurrence {
  return {
    id: "r",
    kind: "fixed",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TH",
    interval_days: null,
    active: true,
    until: null,
    template: {
      title: "Pratica",
      notes: null,
      time: "17:00",
      duration_min: 45,
      area_id: null,
      attention: "low",
      start_date: "2026-10-08",
    },
    ...over,
  };
}

describe("datesToMaterialize", () => {
  it("crea le occorrenze dei prossimi 14 giorni, esclusa la prima attività", () => {
    expect(datesToMaterialize(recurrence(), "2026-10-08")).toEqual([
      "2026-10-12",
      "2026-10-15",
      "2026-10-19",
      "2026-10-22",
    ]);
  });

  it("non ricrea occorrenze passate", () => {
    expect(datesToMaterialize(recurrence(), "2026-10-20")).toEqual([
      "2026-10-22",
      "2026-10-26",
      "2026-10-29",
      "2026-11-02",
    ]);
  });

  it("si ferma alla fine della ricorrenza e ignora quelle non attive", () => {
    expect(datesToMaterialize(recurrence({ until: "2026-10-15" }), "2026-10-08")).toEqual(["2026-10-12", "2026-10-15"]);
    expect(datesToMaterialize(recurrence({ active: false }), "2026-10-08")).toEqual([]);
    expect(datesToMaterialize(recurrence({ kind: "after_completion", rrule: null, interval_days: 30 }), "2026-10-08")).toEqual([]);
  });
});

describe("nextAfterCompletion", () => {
  const r = recurrence({ kind: "after_completion", rrule: null, interval_days: 30 });

  it("riparte dal giorno del completamento", () => {
    expect(nextAfterCompletion(r, "2026-10-10")).toBe("2026-11-09");
  });

  it("non genera oltre la fine, se non attiva o se a calendario fisso", () => {
    expect(nextAfterCompletion({ ...r, until: "2026-10-31" }, "2026-10-10")).toBeNull();
    expect(nextAfterCompletion({ ...r, active: false }, "2026-10-10")).toBeNull();
    expect(nextAfterCompletion(recurrence(), "2026-10-10")).toBeNull();
  });
});
