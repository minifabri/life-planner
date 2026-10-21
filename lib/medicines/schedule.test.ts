import { describe, expect, it } from "vitest";
import { atLocalTime } from "../dates/local";
import type { Medicine, MedicineDose } from "../supabase/types";
import { planMedicineReminders } from "./reminders";
import {
  cleanDraft,
  draftProblem,
  history,
  isDueOn,
  namesList,
  nextDueDay,
  phaseOf,
  scheduleSummary,
  slotPhrase,
  snoozeOptions,
  todayMedicines,
  type MedicineDraft,
} from "./schedule";

const TZ = "Europe/Rome";
const TIMES = { morning: "08:00", evening: "21:00" };

const med = (over: Partial<Medicine> & { id: string }): Medicine => ({
  name: over.id,
  kind: "medicine",
  morning: true,
  evening: false,
  schedule: "daily",
  weekdays: [],
  cycle_on: null,
  cycle_off: null,
  start_date: "2026-10-01",
  end_date: null,
  created_at: "2026-09-30T10:00:00.000Z",
  updated_at: "2026-09-30T10:00:00.000Z",
  ...over,
});

const dose = (over: Partial<MedicineDose> & Pick<MedicineDose, "medicine_id" | "day" | "slot" | "status">): MedicineDose => ({
  id: `${over.medicine_id}-${over.day}-${over.slot}`,
  remind_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

const at = (day: string, time: string) => atLocalTime(day, time, TZ);

describe("quando va presa", () => {
  it("tutti i giorni, tra inizio e fine comprese", () => {
    const m = med({ id: "a", start_date: "2026-10-05", end_date: "2026-10-10" });
    expect(isDueOn(m, "2026-10-04")).toBe(false);
    expect(isDueOn(m, "2026-10-05")).toBe(true);
    expect(isDueOn(m, "2026-10-10")).toBe(true);
    expect(isDueOn(m, "2026-10-11")).toBe(false);
  });

  it("solo certi giorni della settimana", () => {
    // 19 ottobre 2026 è un lunedì.
    const m = med({ id: "a", schedule: "weekdays", weekdays: [1, 3, 5] });
    expect(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23", "2026-10-25"].map((d) => isDueOn(m, d))).toEqual([true, false, true, true, false]);
  });

  it("a cicli di settimane, contate dall'inizio", () => {
    const one = med({ id: "a", schedule: "cycle", cycle_on: 1, cycle_off: 1, start_date: "2026-10-01" });
    expect(isDueOn(one, "2026-10-07")).toBe(true);
    expect(isDueOn(one, "2026-10-08")).toBe(false);
    expect(isDueOn(one, "2026-10-14")).toBe(false);
    expect(isDueOn(one, "2026-10-15")).toBe(true);
    const two = med({ id: "b", schedule: "cycle", cycle_on: 2, cycle_off: 2, start_date: "2026-10-01" });
    expect(["2026-10-01", "2026-10-14", "2026-10-15", "2026-10-28", "2026-10-29"].map((d) => isDueOn(two, d))).toEqual([true, true, false, false, true]);
    expect(nextDueDay(one, "2026-10-09")).toBe("2026-10-15");
  });

  it("fasi e riassunto", () => {
    expect(phaseOf(med({ id: "a", end_date: "2026-10-10" }), "2026-10-11")).toBe("ended");
    expect(phaseOf(med({ id: "a", start_date: "2026-10-20" }), "2026-10-11")).toBe("upcoming");
    expect(scheduleSummary(med({ id: "a", evening: true }), "2026-10-11")).toBe("Mattina e sera · tutti i giorni");
    expect(scheduleSummary(med({ id: "a", schedule: "cycle", cycle_on: 2, cycle_off: 1, end_date: "2026-11-30" }), "2026-10-11")).toBe(
      "Mattina · 2 settimane sì, 1 settimana no · fino al 30 nov",
    );
    expect(scheduleSummary(med({ id: "a", morning: false, evening: true, schedule: "weekdays", weekdays: [5, 1] }), "2026-10-11")).toBe("Sera · lun, ven");
  });
});

describe("domande in Oggi", () => {
  const today = "2026-10-21";
  const a = med({ id: "a" });
  const b = med({ id: "b", evening: true });

  it("un momento chiede dal suo orario, con tutte le medicine senza risposta", () => {
    const early = todayMedicines({ medicines: [a, b], doses: [dose({ medicine_id: "a", day: "2026-10-20", slot: "morning", status: "taken" }), dose({ medicine_id: "b", day: "2026-10-20", slot: "morning", status: "taken" }), dose({ medicine_id: "b", day: "2026-10-20", slot: "evening", status: "taken" })], today, now: at(today, "07:30"), tz: TZ, times: TIMES });
    expect(early.now).toEqual([]);
    expect(early.yesterday).toEqual([]);

    const later = todayMedicines({ medicines: [a, b], doses: [dose({ medicine_id: "a", day: today, slot: "morning", status: "taken" })], today, now: at(today, "08:05"), tz: TZ, times: TIMES });
    expect(later.now.map((g) => [g.slot, g.items.map((i) => i.medicine.id)])).toEqual([["morning", ["b"]]]);
  });

  it("ieri senza risposta: si chiede oggi, una volta; un No (saltata) non torna", () => {
    const q = todayMedicines({ medicines: [b], doses: [dose({ medicine_id: "b", day: "2026-10-20", slot: "morning", status: "taken" })], today, now: at(today, "07:00"), tz: TZ, times: TIMES });
    expect(q.yesterday.map((g) => [g.day, g.slot])).toEqual([["2026-10-20", "evening"]]);
    const answered = todayMedicines({
      medicines: [b],
      doses: [dose({ medicine_id: "b", day: "2026-10-20", slot: "morning", status: "taken" }), dose({ medicine_id: "b", day: "2026-10-20", slot: "evening", status: "skipped" })],
      today,
      now: at(today, "07:00"),
      tz: TZ,
      times: TIMES,
    });
    expect(answered.yesterday).toEqual([]);
  });

  it("di ieri non chiede per una medicina aggiunta oggi", () => {
    const fresh = med({ id: "c", created_at: at(today, "07:00").toISOString() });
    expect(todayMedicines({ medicines: [fresh], doses: [], today, now: at(today, "09:00"), tz: TZ, times: TIMES }).yesterday).toEqual([]);
  });

  it("ricordamelo: aspetta fino all'orario, poi torna a chiedere", () => {
    const snoozed = dose({ medicine_id: "a", day: today, slot: "morning", status: "snoozed", remind_at: at(today, "11:00").toISOString() });
    const before = todayMedicines({ medicines: [a], doses: [snoozed], today, now: at(today, "10:00"), tz: TZ, times: TIMES });
    expect(before.now).toEqual([]);
    expect(before.waiting.map((w) => w.medicine.id)).toEqual(["a"]);
    const after = todayMedicines({ medicines: [a], doses: [snoozed], today, now: at(today, "11:00"), tz: TZ, times: TIMES });
    expect(after.now.map((g) => g.items.length)).toEqual([1]);
    expect(after.waiting).toEqual([]);
  });

  it("un ricordamelo di ieri sera per domattina torna come domanda di ieri", () => {
    const snoozed = dose({ medicine_id: "b", day: "2026-10-20", slot: "evening", status: "snoozed", remind_at: at(today, "08:00").toISOString() });
    const morningOk = dose({ medicine_id: "b", day: "2026-10-20", slot: "morning", status: "taken" });
    const q = todayMedicines({ medicines: [b], doses: [snoozed, morningOk], today, now: at(today, "08:00"), tz: TZ, times: TIMES });
    expect(q.yesterday.map((g) => g.slot)).toEqual(["evening"]);
  });
});

describe("ricordamelo", () => {
  const today = "2026-10-21";
  it("al mattino: 1 ora, 3 ore, stasera", () => {
    expect(snoozeOptions("morning", at(today, "08:00"), today, TZ, TIMES).map((o) => o.label)).toEqual(["Tra 1 ora", "Tra 3 ore", "Stasera alle 21:00"]);
    // Troppo vicino alla sera: "stasera" non serve.
    expect(snoozeOptions("morning", at(today, "19:00"), today, TZ, TIMES).map((o) => o.label)).toEqual(["Tra 1 ora", "Tra 3 ore"]);
  });
  it("la sera: 1 ora, 3 ore, domattina", () => {
    const o = snoozeOptions("evening", at(today, "21:00"), today, TZ, TIMES);
    expect(o.map((x) => x.label)).toEqual(["Tra 1 ora", "Tra 3 ore", "Domattina alle 08:00"]);
    expect(o[2].at).toEqual(at("2026-10-22", "08:00"));
  });
  it("frasi", () => {
    expect(slotPhrase("evening", "2026-10-20", today)).toBe("Ieri sera");
    expect(slotPhrase("morning", today, today)).toBe("Stamattina");
    expect(namesList(["A", "B", "C"])).toBe("A, B e C");
  });
});

describe("storico", () => {
  it("giorno per giorno: presa, saltata, senza risposta; solo i giorni previsti", () => {
    const m = med({ id: "a", schedule: "weekdays", weekdays: [1, 3], start_date: "2026-10-12" });
    const doses = [dose({ medicine_id: "a", day: "2026-10-19", slot: "morning", status: "taken" }), dose({ medicine_id: "a", day: "2026-10-14", slot: "morning", status: "skipped" })];
    expect(history(m, doses, "2026-10-21").map((h) => [h.day, h.slots[0].state])).toEqual([
      ["2026-10-19", "taken"],
      ["2026-10-14", "skipped"],
      ["2026-10-12", "none"],
    ]);
  });
});

describe("scheda", () => {
  const draft: MedicineDraft = { name: " Magnesio ", kind: "supplement", morning: false, evening: true, schedule: "cycle", weekdays: [2], cycle_on: 1, cycle_off: 1, start_date: "2026-10-21", end_date: "" };
  it("controlli e pulizia", () => {
    expect(draftProblem({ ...draft, name: " " })).toBe("Scrivi il nome.");
    expect(draftProblem({ ...draft, evening: false })).toBe("Scegli mattina, sera o tutte e due.");
    expect(draftProblem({ ...draft, end_date: "2026-10-01" })).toBe("La fine viene prima dell'inizio.");
    expect(draftProblem(draft)).toBeNull();
    expect(cleanDraft(draft)).toMatchObject({ name: "Magnesio", weekdays: [], cycle_on: 1, end_date: null });
  });
});

describe("notifiche", () => {
  const base = { times: TIMES, tz: TZ, firstDay: "2026-10-20", lastDay: "2026-10-22", shift: (d: Date) => d };
  const a = med({ id: "a", evening: true });

  it("all'orario del momento, solo se c'è qualcosa senza risposta, con titolo neutro", () => {
    const from = at("2026-10-21", "07:55");
    const to = at("2026-10-21", "08:05");
    const r = planMedicineReminders({ ...base, medicines: [a], doses: [], from, to });
    expect(r).toEqual([{ key: "med:morning:2026-10-21", fireAt: at("2026-10-21", "08:00"), title: "Promemoria del mattino", body: "Tocca per segnare cosa hai preso." }]);
    const done = [dose({ medicine_id: "a", day: "2026-10-21", slot: "morning", status: "taken" })];
    expect(planMedicineReminders({ ...base, medicines: [a], doses: done, from, to })).toEqual([]);
  });

  it("ricordamelo: una notifica per orario, nessuna se coincide con quella del momento", () => {
    const b = med({ id: "b" });
    const eleven = at("2026-10-21", "11:00").toISOString();
    const doses = [
      dose({ medicine_id: "a", day: "2026-10-21", slot: "morning", status: "snoozed", remind_at: eleven }),
      dose({ medicine_id: "b", day: "2026-10-21", slot: "morning", status: "snoozed", remind_at: eleven }),
    ];
    const r = planMedicineReminders({ ...base, medicines: [a, b], doses, from: at("2026-10-21", "10:55"), to: at("2026-10-21", "11:05") });
    expect(r.map((x) => [x.key, x.title])).toEqual([[`med:snooze:${eleven}`, "Promemoria"]]);

    const evening = at("2026-10-21", "21:00").toISOString();
    const both = planMedicineReminders({
      ...base,
      medicines: [a],
      doses: [dose({ medicine_id: "a", day: "2026-10-21", slot: "morning", status: "snoozed", remind_at: evening })],
      from: at("2026-10-21", "20:55"),
      to: at("2026-10-21", "21:05"),
    });
    expect(both.map((x) => x.key)).toEqual(["med:evening:2026-10-21"]);
  });

  it("una medicina aggiunta dopo l'orario non manda la notifica di quel momento", () => {
    const fresh = med({ id: "c", created_at: at("2026-10-21", "08:30").toISOString() });
    expect(planMedicineReminders({ ...base, medicines: [fresh], doses: [], from: at("2026-10-21", "07:55"), to: at("2026-10-21", "08:05") })).toEqual([]);
  });
});
