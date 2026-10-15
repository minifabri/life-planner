import { describe, expect, it } from "vitest";
import { parseCapture } from "../parser/parse";
import { describeDraft, destinationLabel, planCapture, quickDays, whenLabel, type CaptureDraft } from "./plan";

const TODAY = "2026-10-10";
const TZ = "Europe/Rome";

function draft(text: string, overrides: Partial<CaptureDraft> = {}): CaptureDraft {
  return { ...parseCapture(text, { today: TODAY, now: "10:00" }), ...overrides };
}

describe("planCapture", () => {
  it("attività con giorno e ora", () => {
    const plan = planCapture(draft("domani alle 20 mettere in ammollo le lenticchie"), TODAY, TZ);
    expect(plan).toEqual({
      kind: "task",
      input: {
        title: "Mettere in ammollo le lenticchie",
        notes: null,
        date: "2026-10-11",
        time: "20:00",
        duration_min: null,
        due_date: null,
        window_start: null,
        attention: "low",
        area_id: null,
      },
      repeat: { kind: "none" },
    });
  });

  it("attività nel periodo: la finestra parte da oggi", () => {
    const plan = planCapture(draft("pagare la bolletta entro domenica"), TODAY, TZ);
    expect(plan).toMatchObject({ kind: "task", input: { date: null, time: null, due_date: "2026-10-11", window_start: TODAY } });
  });

  it("un'attività con orario ma senza giorno va a oggi; senza giorno non tiene l'orario", () => {
    expect(planCapture(draft("stirare", { time: "18:00" }), TODAY, TZ)).toMatchObject({ input: { date: TODAY, time: "18:00" } });
    expect(planCapture(draft("stirare"), TODAY, TZ)).toMatchObject({ input: { date: null, time: null } });
  });

  it("attività ricorrente: regola fissa, niente finestra", () => {
    const plan = planCapture(draft("innaffiare le piante ogni sabato", { windowEnd: "2026-10-31" }), TODAY, TZ);
    expect(plan).toMatchObject({
      kind: "task",
      input: { date: TODAY, due_date: null, window_start: null },
      repeat: { kind: "fixed", rrule: "FREQ=WEEKLY;BYDAY=SA" },
    });
  });

  it("evento con orario e durata, nel fuso del profilo", () => {
    const plan = planCapture(draft("pratica yoga domani alle 17 per 45 minuti"), TODAY, TZ);
    expect(plan).toMatchObject({
      kind: "event",
      input: {
        title: "Pratica yoga",
        all_day: false,
        start_date: null,
        start_at: "2026-10-11T15:00:00.000Z",
        end_at: "2026-10-11T15:45:00.000Z",
        tz: TZ,
        rrule: null,
      },
    });
  });

  it("evento senza orario: tutto il giorno, oggi se manca la data", () => {
    const plan = planCapture(draft("compleanno Marta", { kind: "event" }), TODAY, TZ);
    expect(plan).toMatchObject({ kind: "event", input: { all_day: true, start_date: TODAY, start_at: null, end_at: null } });
  });

  it("compleanno: tutto il giorno, ogni anno, con il nome come titolo", () => {
    expect(planCapture(draft("compleanno Marta 12 ottobre"), TODAY, TZ)).toEqual({
      kind: "event",
      input: {
        title: "Marta",
        notes: null,
        location: null,
        all_day: true,
        start_date: "2026-10-12",
        end_date: null,
        start_at: null,
        end_at: null,
        tz: TZ,
        rrule: "FREQ=YEARLY",
        area_id: null,
        attention: "low",
        kind: "birthday",
      },
    });
    expect(planCapture(draft("compleanno mamma 29/2/2028"), TODAY, TZ)).toMatchObject({
      input: { kind: "birthday", rrule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" },
    });
    expect(describeDraft(draft("compleanno Marta 12 ottobre"), TODAY)).toBe("Compleanno aggiunto · lunedì · ogni anno");
  });

  it("un orario scelto dal chip trasforma il compleanno in un evento normale", () => {
    const plan = planCapture(draft("compleanno Marta 12 ottobre", { time: "20:00" }), TODAY, TZ);
    expect(plan).toMatchObject({ kind: "event", input: { title: "Compleanno Marta", all_day: false, rrule: null } });
    expect(plan.kind === "event" && plan.input.kind).toBeFalsy();
  });

  it("evento ricorrente: la settimana senza giorni usa quello della prima volta", () => {
    expect(planCapture(draft("yoga ogni lunedì alle 19"), TODAY, TZ)).toMatchObject({ input: { rrule: "FREQ=WEEKLY;BYDAY=MO" } });
    expect(planCapture(draft("riunione ogni settimana martedì alle 10"), TODAY, TZ)).toMatchObject({
      input: { start_at: "2026-10-13T08:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=TU" },
    });
  });

  it("spesa e wishlist tengono solo il nome (e il link)", () => {
    expect(planCapture(draft("Comprare tofu"), TODAY, TZ)).toEqual({ kind: "shopping", name: "tofu" });
    expect(planCapture(draft("wish: borsa https://example.com/b"), TODAY, TZ)).toEqual({
      kind: "wishlist",
      name: "Borsa",
      url: "https://example.com/b",
    });
  });

  it("registrazione: oggi se manca la data, sensibilità dalla categoria", () => {
    const d = draft("log: visita", { categoryId: "c1", sensitive: true });
    expect(planCapture(d, TODAY, TZ)).toEqual({
      kind: "log",
      entry: { title: "Visita", date: TODAY, time: null, category_id: "c1", is_sensitive: true },
    });
  });
});

describe("destinationLabel", () => {
  it("dice dove finisce ciò che si aggiunge", () => {
    expect(destinationLabel(draft("comprare tofu"), TODAY)).toBe("Lista spesa");
    expect(destinationLabel(draft("oggi chiamare l'idraulico"), TODAY)).toBe("Oggi · Da fare");
    expect(destinationLabel(draft("domani alle 20 mettere in ammollo le lenticchie"), TODAY)).toBe("Agenda");
    expect(destinationLabel(draft("restituire il libro entro domenica"), TODAY)).toBe("Nel periodo");
    expect(destinationLabel(draft("prenotare unghie"), TODAY)).toBe("Senza data");
  });
});

describe("etichette", () => {
  it("descrive il quando", () => {
    expect(whenLabel(draft("yoga domani"), TODAY)).toBe("domani");
    expect(whenLabel(draft("pagare entro fine mese"), TODAY)).toBe("entro fine mese");
    expect(whenLabel(draft("idea"), TODAY)).toBe("senza data");
    expect(whenLabel(draft("idea", { kind: "event" }), TODAY)).toBe("oggi");
  });

  it("riassume cosa è stato aggiunto senza mostrare il testo delle registrazioni", () => {
    expect(describeDraft(draft("dentista martedì alle 15"), TODAY)).toBe("Evento aggiunto · martedì · 15:00");
    expect(describeDraft(draft("stirare un'ora"), TODAY)).toBe("Attività aggiunta · 1 h");
    expect(describeDraft(draft("comprare tofu"), TODAY)).toBe("Aggiunto alla spesa");
    expect(describeDraft(draft("log: ciclo"), TODAY)).toBe("Registrazione salvata");
  });

  it("propone sette giorni a partire da oggi", () => {
    const days = quickDays(TODAY);
    expect(days.map((d) => d.label)).toEqual(["Oggi", "Domani", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"]);
    expect(days[6].date).toBe("2026-10-16");
    expect(quickDays(TODAY, true).slice(0, 3)).toEqual([
      { label: "Oggi", date: TODAY },
      { label: "Ieri", date: "2026-10-09" },
      { label: "8 ott", date: "2026-10-08" },
    ]);
  });
});

describe("allenamenti", () => {
  const workout = (text: string) => ({ ...parseCapture(text, { today: TODAY, now: "10:00", activities: ["Corsa"] }) });

  it("da oggi in poi si pianifica", () => {
    const d = workout("corsa domani alle 18 45 min");
    expect(planCapture(d, TODAY, TZ)).toEqual({
      kind: "workout",
      input: {
        activity: "Corsa",
        date: "2026-10-11",
        time: "18:00",
        duration_min: 45,
        notes: null,
        status: "planned",
        completed_at: null,
        distance_m: null,
        energy_kcal: null,
        avg_hr: null,
      },
    });
    expect(describeDraft(d, TODAY)).toBe("Allenamento aggiunto · domani · 18:00 · 45 min");
  });

  it("in un giorno passato si annota come fatto", () => {
    const plan = planCapture(workout("corsa ieri 30 min"), TODAY, TZ);
    expect(plan).toMatchObject({ kind: "workout", input: { date: "2026-10-09", status: "done", completed_at: "2026-10-09T10:00:00.000Z" } });
  });
});
