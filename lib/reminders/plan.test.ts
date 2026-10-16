import { describe, expect, it } from "vitest";
import { atLocalTime } from "../dates/local";
import type { EventException, EventRow } from "../supabase/types";
import { afterQuietHours, inQuietHours, planReminders, type PlanInput, type PlanTask, type ReminderSettings } from "./plan";

const TZ = "Europe/Rome";
const at = (day: string, time: string) => atLocalTime(day, time, TZ);

const settings: ReminderSettings = {
  timezone: TZ,
  morning_overview_time: "07:00:00",
  evening_review_time: "20:30:00",
  quiet_start: "22:00:00",
  quiet_end: "07:30:00",
  meal_prep_reminder_time: "20:00:00",
  notify_medium: true,
  notify_high: true,
  quiet_allow_high: false,
  notify_meal_prep: true,
  notify_morning: false,
  notify_evening: false,
};

function task(patch: Partial<PlanTask>): PlanTask {
  return {
    id: "t1",
    title: "Chiamare il commercialista",
    notes: null,
    date: "2026-10-12",
    time: null,
    due_date: null,
    window_start: null,
    attention: "medium",
    remind: false,
    status: "open",
    completed_at: null,
    original_date: null,
    source: "manual",
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function event(patch: Partial<EventRow>): EventRow {
  return {
    id: "e1",
    title: "Dentista",
    notes: null,
    location: null,
    start_at: at("2026-10-12", "15:00").toISOString(),
    end_at: at("2026-10-12", "16:00").toISOString(),
    all_day: false,
    start_date: null,
    end_date: null,
    tz: TZ,
    rrule: null,
    area_id: null,
    attention: "medium",
    source: "app",
    kind: "event",
    gcal_calendar_id: null,
    gcal_event_id: null,
    gcal_etag: null,
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    lesson: null,
    deleted_at: null,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    ...patch,
  };
}

function plan(input: Partial<PlanInput>, from: Date, to: Date) {
  return planReminders({ settings, tasks: [], events: [], exceptions: [], ...input }, from, to);
}

/** Tutto ciò che scatta in un giorno intero, come se il cron girasse senza buchi. */
function planDay(input: Partial<PlanInput>, day: string) {
  return plan(input, at(day, "00:00"), at(day, "23:59"));
}

describe("fascia di silenzio", () => {
  it("riconosce la fascia a cavallo della mezzanotte", () => {
    expect(inQuietHours("23:10", "22:00", "07:30")).toBe(true);
    expect(inQuietHours("06:00", "22:00", "07:30")).toBe(true);
    expect(inQuietHours("07:30", "22:00", "07:30")).toBe(false);
    expect(inQuietHours("21:59", "22:00", "07:30")).toBe(false);
  });

  it("riconosce la fascia nello stesso giorno e quella spenta", () => {
    expect(inQuietHours("14:00", "13:00", "15:00")).toBe(true);
    expect(inQuietHours("15:00", "13:00", "15:00")).toBe(false);
    expect(inQuietHours("03:00", "00:00", "00:00")).toBe(false);
  });

  it("sposta alla fine della fascia, il giorno dopo se serve", () => {
    expect(afterQuietHours(at("2026-10-12", "23:00"), settings)).toEqual(at("2026-10-13", "07:30"));
    expect(afterQuietHours(at("2026-10-12", "06:00"), settings)).toEqual(at("2026-10-12", "07:30"));
    expect(afterQuietHours(at("2026-10-12", "12:00"), settings)).toEqual(at("2026-10-12", "12:00"));
  });
});

describe("attività", () => {
  it("bassa: nessuna notifica", () => {
    expect(planDay({ tasks: [task({ attention: "low", time: "10:00:00" })] }, "2026-10-12")).toEqual([]);
  });

  it("media con orario: una notifica all'orario", () => {
    const out = planDay({ tasks: [task({ time: "10:00:00" })] }, "2026-10-12");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fireAt: at("2026-10-12", "10:00"), title: "Chiamare il commercialista", body: "Oggi alle 10:00", targetType: "task", targetId: "t1" });
    expect(planDay({ tasks: [task({ time: "10:00:00" })] }, "2026-10-11")).toEqual([]);
  });

  it("media senza orario: al mattino, dopo la fascia di silenzio", () => {
    const out = planDay({ tasks: [task({})] }, "2026-10-12");
    expect(out.map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-12", "07:30"), "Da fare oggi"]]);
  });

  it("alta: anche il richiamo del giorno prima", () => {
    const tasks = [task({ attention: "high", time: "10:00:00" })];
    expect(planDay({ tasks }, "2026-10-11").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-11", "10:00"), "Domani alle 10:00"]]);
    expect(planDay({ tasks }, "2026-10-12").map((r) => r.body)).toEqual(["Oggi alle 10:00"]);
  });

  it("alta senza orario: il richiamo arriva la sera prima", () => {
    const out = planDay({ tasks: [task({ attention: "high" })] }, "2026-10-11");
    expect(out.map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-11", "20:30"), "Da fare domani"]]);
  });

  it("nel periodo: avvisa nell'ultimo giorno utile", () => {
    const tasks = [task({ date: null, due_date: "2026-10-12", attention: "high" })];
    expect(planDay({ tasks }, "2026-10-11").map((r) => r.body)).toEqual(["Scade domani"]);
    expect(planDay({ tasks }, "2026-10-12").map((r) => r.body)).toEqual(["Scade oggi"]);
  });

  it("completate, eliminate o con il livello spento non notificano", () => {
    const day = "2026-10-12";
    expect(planDay({ tasks: [task({ status: "done" })] }, day)).toEqual([]);
    expect(planDay({ tasks: [task({ deleted_at: "2026-10-02T00:00:00Z" })] }, day)).toEqual([]);
    expect(planDay({ tasks: [task({})], settings: { ...settings, notify_medium: false } }, day)).toEqual([]);
    expect(planDay({ tasks: [task({ attention: "high" })], settings: { ...settings, notify_high: false } }, day)).toEqual([]);
  });

  it("promemoria: una notifica anche con attenzione bassa o con il livello spento", () => {
    const low = [task({ attention: "low", remind: true, time: "10:00:00" })];
    expect(planDay({ tasks: low }, "2026-10-12").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-12", "10:00"), "Oggi alle 10:00"]]);
    expect(planDay({ tasks: low }, "2026-10-11")).toEqual([]);
    const off = { ...settings, notify_medium: false, notify_high: false };
    expect(planDay({ tasks: [task({ remind: true })], settings: off }, "2026-10-12").map((r) => r.body)).toEqual(["Da fare oggi"]);
    // Con l'alta spenta resta la notifica chiesta, senza il richiamo del giorno prima.
    const high = [task({ attention: "high", remind: true, time: "10:00:00" })];
    expect(planDay({ tasks: high, settings: off }, "2026-10-11")).toEqual([]);
    expect(planDay({ tasks: high, settings: off }, "2026-10-12")).toHaveLength(1);
  });

  it("promemoria: senza orario al mattino, nel periodo l'ultimo giorno, mai due volte", () => {
    const low = { attention: "low" as const, remind: true };
    expect(planDay({ tasks: [task(low)] }, "2026-10-12").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-12", "07:30"), "Da fare oggi"]]);
    expect(planDay({ tasks: [task({ ...low, date: null, due_date: "2026-10-12" })] }, "2026-10-12").map((r) => r.body)).toEqual(["Scade oggi"]);
    expect(planDay({ tasks: [task({ ...low, date: null })] }, "2026-10-12")).toEqual([]);
    expect(planDay({ tasks: [task({ remind: true, time: "10:00:00" })] }, "2026-10-12")).toHaveLength(1);
    expect(planDay({ tasks: [task({ ...low, status: "done" })] }, "2026-10-12")).toEqual([]);
  });

  it("in silenzio l'invio slitta e il testo resta vero", () => {
    const tasks = [task({ time: "23:00:00" })];
    expect(planDay({ tasks }, "2026-10-12")).toEqual([]);
    expect(planDay({ tasks }, "2026-10-13").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-13", "07:30"), "Ieri alle 23:00"]]);
  });

  it("le alte attraversano il silenzio solo se configurato", () => {
    const tasks = [task({ attention: "high", time: "06:00:00" })];
    const open = { ...settings, quiet_allow_high: true };
    expect(planDay({ tasks }, "2026-10-12").map((r) => r.fireAt)).toEqual([at("2026-10-12", "07:30")]);
    expect(planDay({ tasks, settings: open }, "2026-10-12").map((r) => r.fireAt)).toEqual([at("2026-10-12", "06:00")]);
  });

  it("creata o modificata a orario già passato: niente notifica in ritardo", () => {
    const tasks = [task({ time: "10:00:00", updated_at: at("2026-10-12", "10:03").toISOString() })];
    expect(plan({ tasks }, at("2026-10-12", "09:55"), at("2026-10-12", "10:05"))).toEqual([]);
  });

  it("spostata a un altro orario notifica di nuovo, con un'altra chiave", () => {
    const a = planDay({ tasks: [task({ time: "10:00:00" })] }, "2026-10-12")[0];
    const b = planDay({ tasks: [task({ time: "15:00:00" })] }, "2026-10-12")[0];
    expect(a.key).not.toBe(b.key);
  });

  it("l'intervallo esclude l'inizio e comprende la fine", () => {
    const tasks = [task({ time: "10:00:00" })];
    expect(plan({ tasks }, at("2026-10-12", "09:50"), at("2026-10-12", "10:00"))).toHaveLength(1);
    expect(plan({ tasks }, at("2026-10-12", "10:00"), at("2026-10-12", "10:10"))).toEqual([]);
  });
});

describe("preparazione dei pasti", () => {
  const meal = task({ source: "meal", attention: "low", title: "Preparare il pranzo di domani", notes: "Pasta al ragù", date: "2026-10-12" });

  it("avvisa all'ora scelta, anche se l'attenzione è bassa", () => {
    const out = planDay({ tasks: [meal] }, "2026-10-12");
    expect(out.map((r) => [r.fireAt, r.title, r.body])).toEqual([[at("2026-10-12", "20:00"), "Preparare il pranzo di domani", "Pasta al ragù"]]);
  });

  it("un pasto di oggi avvisa all'orario della sua attività, non a quello dei pasti", () => {
    const today = { ...meal, title: "Preparare il pranzo di oggi", notes: "Riso e lenticchie", time: "12:00:00", created_at: "2026-10-12T07:00:00Z", updated_at: "2026-10-12T07:00:00Z" };
    const out = planDay({ tasks: [today] }, "2026-10-12");
    expect(out.map((r) => [r.fireAt, r.title, r.key])).toEqual([[at("2026-10-12", "12:00"), "Preparare il pranzo di oggi", "task:t1:meal:2026-10-12T12:00"]]);
  });

  it("non avvisa se è già spuntata o se l'avviso è spento", () => {
    expect(planDay({ tasks: [{ ...meal, status: "done" }] }, "2026-10-12")).toEqual([]);
    expect(planDay({ tasks: [meal], settings: { ...settings, notify_meal_prep: false } }, "2026-10-12")).toEqual([]);
  });
});

describe("eventi", () => {
  it("media: all'inizio, con il luogo", () => {
    const out = planDay({ events: [event({ location: "Via Roma 3" })] }, "2026-10-12");
    expect(out.map((r) => [r.fireAt, r.body, r.targetType])).toEqual([[at("2026-10-12", "15:00"), "Oggi alle 15:00 · Via Roma 3", "event"]]);
  });

  it("alta: richiamo alla stessa ora del giorno prima", () => {
    const events = [event({ attention: "high" })];
    expect(planDay({ events }, "2026-10-11").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-11", "15:00"), "Domani alle 15:00"]]);
  });

  it("tutto il giorno: al mattino", () => {
    const events = [event({ all_day: true, start_at: null, end_at: null, start_date: "2026-10-12", attention: "high" })];
    expect(planDay({ events }, "2026-10-11").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-11", "20:30"), "Domani, tutto il giorno"]]);
    expect(planDay({ events }, "2026-10-12").map((r) => [r.fireAt, r.body])).toEqual([[at("2026-10-12", "07:30"), "Oggi, tutto il giorno"]]);
  });

  it("su più giorni avvisa una volta sola", () => {
    const events = [event({ all_day: true, start_at: null, end_at: null, start_date: "2026-10-12", end_date: "2026-10-14" })];
    expect(planDay({ events }, "2026-10-12")).toHaveLength(1);
    expect(planDay({ events }, "2026-10-13")).toEqual([]);
  });

  it("serie: ogni occorrenza, tranne quelle annullate o spostate", () => {
    const events = [event({ rrule: "FREQ=WEEKLY", start_at: at("2026-10-05", "15:00").toISOString(), end_at: at("2026-10-05", "16:00").toISOString() })];
    expect(planDay({ events }, "2026-10-12").map((r) => r.fireAt)).toEqual([at("2026-10-12", "15:00")]);
    expect(planDay({ events }, "2026-10-13")).toEqual([]);

    const ex = (patch: Partial<EventException>): EventException => ({
      id: "x1",
      event_id: "e1",
      original_start: at("2026-10-12", "15:00").toISOString(),
      cancelled: false,
      new_start_at: null,
      new_end_at: null,
      ...patch,
    });
    expect(planDay({ events, exceptions: [ex({ cancelled: true })] }, "2026-10-12")).toEqual([]);
    const moved = [ex({ new_start_at: at("2026-10-12", "17:00").toISOString(), new_end_at: at("2026-10-12", "18:00").toISOString() })];
    expect(planDay({ events, exceptions: moved }, "2026-10-12").map((r) => r.fireAt)).toEqual([at("2026-10-12", "17:00")]);
  });

  it("serie: l'ora locale resta la stessa dopo il cambio dell'ora", () => {
    const events = [event({ rrule: "FREQ=WEEKLY", start_at: at("2026-10-19", "15:00").toISOString(), end_at: at("2026-10-19", "16:00").toISOString() })];
    // L'ora solare torna il 25 ottobre 2026.
    expect(planDay({ events }, "2026-10-26").map((r) => r.fireAt)).toEqual([at("2026-10-26", "15:00")]);
  });

  it("bassa o eliminato: niente", () => {
    expect(planDay({ events: [event({ attention: "low" })] }, "2026-10-12")).toEqual([]);
    expect(planDay({ events: [event({ deleted_at: "2026-10-02T00:00:00Z" })] }, "2026-10-12")).toEqual([]);
  });
});

describe("panoramica e revisione", () => {
  const tasks = [
    task({ id: "a", attention: "low" }),
    task({ id: "b", attention: "low", time: "10:00:00" }),
    task({ id: "c", attention: "low", date: "2026-10-10" }),
  ];

  it("spente in partenza", () => {
    expect(planDay({ tasks }, "2026-10-12")).toEqual([]);
  });

  it("mattino: la frase di Oggi, dopo il silenzio", () => {
    const out = planDay({ tasks, events: [event({ attention: "low" })], name: "Bibi", settings: { ...settings, notify_morning: true } }, "2026-10-12");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      key: "digest:morning:2026-10-12",
      fireAt: at("2026-10-12", "07:30"),
      title: "La tua giornata",
      body: "Buongiorno, Bibi. Oggi 1 appuntamento e 2 attività. 1 rimasta indietro.",
    });
  });

  it("sera: solo se resta qualcosa di aperto", () => {
    const on = { ...settings, notify_evening: true };
    const out = planDay({ tasks, name: "Bibi", settings: on }, "2026-10-12");
    expect(out.map((r) => [r.fireAt, r.title, r.body])).toEqual([[at("2026-10-12", "20:30"), "Revisione della sera", "Buonasera, Bibi. Restano 2 attività aperte."]]);
    expect(planDay({ tasks: tasks.map((t) => ({ ...t, status: "done" as const })), settings: on }, "2026-10-12")).toEqual([]);
  });
});
