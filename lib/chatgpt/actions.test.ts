import { describe, expect, it } from "vitest";
import type { EventRow } from "../supabase/types";
import {
  addedMessage,
  buildAgenda,
  buildLists,
  isLocalDate,
  normalizeTime,
  parseEventInput,
  parseRange,
  parseTaskInput,
  planShopping,
  planWishlist,
  type AgendaTask,
} from "./actions";
import { openApiSpec } from "./openapi";

const TODAY = "2026-11-19";
const TZ = "Europe/Rome";

function value<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function error(r: { ok: boolean; error?: string }): string {
  expect(r.ok).toBe(false);
  return r.error!;
}

describe("controlli di base", () => {
  it("riconosce solo date reali", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-31")).toBe(false);
    expect(isLocalDate("19/11/2026")).toBe(false);
  });

  it("normalizza gli orari", () => {
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("18.15")).toBe("18:15");
    expect(normalizeTime("07:00:00")).toBe("07:00");
    expect(normalizeTime("25:00")).toBeNull();
  });
});

describe("parseTaskInput", () => {
  it("senza data è per oggi", () => {
    const task = value(parseTaskInput({ title: "  Chiamare   il dentista " }, TODAY));
    expect(task).toMatchObject({ title: "Chiamare il dentista", date: TODAY, due_date: null, attention: "low", remind: false, source: "manual" });
  });

  it("con data e orario", () => {
    const task = value(parseTaskInput({ title: "Yoga", date: "2026-11-21", time: "9:00", duration_min: 60, attention: "medium" }, TODAY));
    expect(task).toMatchObject({ date: "2026-11-21", time: "09:00", duration_min: 60, attention: "medium" });
  });

  it("con sola scadenza è nel periodo, da oggi", () => {
    const task = value(parseTaskInput({ title: "Rinnovare la carta d'identità", due_date: "2026-12-15", time: "10:00" }, TODAY));
    expect(task).toMatchObject({ date: null, time: null, due_date: "2026-12-15", window_start: TODAY });
  });

  it("rifiuta richieste sbagliate con un messaggio", () => {
    expect(error(parseTaskInput({}, TODAY))).toMatch(/titolo/);
    expect(error(parseTaskInput({ title: "x", date: "domani" }, TODAY))).toMatch(/AAAA-MM-GG/);
    expect(error(parseTaskInput({ title: "x", time: "pomeriggio" }, TODAY))).toMatch(/HH:mm/);
    expect(error(parseTaskInput({ title: "x", attention: "urgent" }, TODAY))).toMatch(/attenzione/i);
    expect(error(parseTaskInput({ title: "x", due_date: "2026-11-01" }, TODAY))).toMatch(/passata/);
    expect(error(parseTaskInput({ title: "x", date: "2036-01-01" }, TODAY))).toMatch(/lontana/);
    expect(error(parseTaskInput([], TODAY))).toMatch(/JSON/);
  });
});

describe("parseEventInput", () => {
  it("senza orario è di tutto il giorno", () => {
    const ev = value(parseEventInput({ title: "Compleanno di Sara", date: "2026-11-25" }, TODAY, TZ));
    expect(ev).toMatchObject({ all_day: true, start_date: "2026-11-25", end_date: null, start_at: null, tz: TZ, source: "app" });
  });

  it("converte l'ora locale nel fuso del profilo", () => {
    const ev = value(parseEventInput({ title: "Cena", date: "2026-11-20", start_time: "20:30", end_time: "22:00", location: "Trattoria" }, TODAY, TZ));
    expect(ev.start_at).toBe("2026-11-20T19:30:00.000Z");
    expect(ev.end_at).toBe("2026-11-20T21:00:00.000Z");
    expect(ev.location).toBe("Trattoria");
  });

  it("una fine prima dell'inizio è il giorno dopo", () => {
    const ev = value(parseEventInput({ title: "Concerto", date: "2026-11-20", start_time: "22:00", end_time: "01:00" }, TODAY, TZ));
    expect(ev.end_at).toBe("2026-11-21T00:00:00.000Z");
  });

  it("riconosce la categoria dal titolo", () => {
    expect(value(parseEventInput({ title: "Volo Roma → Milano", date: "2026-12-12", start_time: "08:00" }, TODAY, TZ)).kind).toBe("travel");
  });

  it("rifiuta richieste sbagliate", () => {
    expect(error(parseEventInput({ title: "x" }, TODAY, TZ))).toMatch(/data/);
    expect(error(parseEventInput({ title: "x", date: TODAY, end_time: "10:00" }, TODAY, TZ))).toMatch(/inizio/);
    expect(error(parseEventInput({ title: "x", date: TODAY, end_date: "2026-11-01" }, TODAY, TZ))).toMatch(/prima/);
    expect(error(parseEventInput({ title: "x", date: TODAY, start_time: "10:00", end_date: TODAY, end_time: "09:00" }, TODAY, TZ))).toMatch(/finisce/);
  });
});

describe("planShopping", () => {
  it("separa la quantità e salta ciò che è già in lista", () => {
    const plan = value(planShopping({ items: ["2 latte di avena", { name: "Tofu", quantity: 3 }, { name: "Pane" }, "pàne"] }, [{ name: "Tofu" }]));
    expect(plan.create).toEqual([
      { name: "latte di avena", quantity: "2" },
      { name: "Pane", quantity: null },
    ]);
    expect(plan.already).toEqual(["Tofu", "pàne"]);
  });

  it("rifiuta elenchi vuoti, troppo lunghi o senza nome", () => {
    expect(error(planShopping({}, []))).toMatch(/items/);
    expect(error(planShopping({ items: [] }, []))).toMatch(/vuoto/);
    expect(error(planShopping({ items: Array(51).fill("x") }, []))).toMatch(/50/);
    expect(error(planShopping({ items: [{ quantity: "2" }] }, []))).toMatch(/nome/);
  });
});

describe("planWishlist", () => {
  it("legge prezzi indicativi, link e interesse", () => {
    const plan = value(
      planWishlist(
        {
          items: [
            { name: "Siero alla niacinamide", brand: "The Ordinary", category: "Skincare", price: "~8 €", url: "https://example.com/p", interest: 3 },
            { name: "Crema solare", price: 19.9, url: "javascript:alert(1)" },
            { name: "Tonico", price: "dipende", notes: "Per pelli miste" },
          ],
        },
        [],
      ),
    );
    expect(plan.create[0]).toMatchObject({ price_amount: 8, price_currency: "EUR", price_is_estimate: true, url: "https://example.com/p", interest: 3, source: "chatgpt" });
    expect(plan.create[1]).toMatchObject({ price_amount: 19.9, price_is_estimate: false, url: null, interest: 2 });
    expect(plan.create[2]).toMatchObject({ price_amount: null, price_currency: null, notes: "Per pelli miste\nPrezzo: dipende" });
  });

  it("non duplica i desiderati con stesso nome e marca", () => {
    const plan = value(planWishlist({ items: [{ name: "Siero", brand: "The Ordinary" }, { name: "Siero", brand: "Altra" }] }, [{ name: "siero", brand: "the ordinary" }]));
    expect(plan.create.map((i) => i.brand)).toEqual(["Altra"]);
    expect(plan.already).toEqual(["Siero (The Ordinary)"]);
  });
});

describe("parseRange", () => {
  it("di base da oggi per una settimana", () => {
    expect(value(parseRange({}, TODAY))).toEqual({ from: TODAY, to: "2026-11-25" });
  });

  it("al massimo 31 giorni", () => {
    expect(value(parseRange({ from: "2026-12-01", to: "2026-12-31" }, TODAY)).to).toBe("2026-12-31");
    expect(error(parseRange({ from: "2026-12-01", to: "2027-01-01" }, TODAY))).toMatch(/31/);
    expect(error(parseRange({ from: "2026-12-02", to: "2026-12-01" }, TODAY))).toMatch(/prima/);
  });
});

function task(over: Partial<AgendaTask>): AgendaTask {
  return {
    id: Math.random().toString(36),
    title: "Attività",
    notes: null,
    date: null,
    time: null,
    duration_min: null,
    due_date: null,
    window_start: null,
    attention: "low",
    status: "open",
    completed_at: null,
    original_date: null,
    created_at: "2026-11-01T10:00:00Z",
    deleted_at: null,
    ...over,
  };
}

function event(over: Partial<EventRow>): EventRow {
  return {
    id: Math.random().toString(36),
    title: "Evento",
    notes: null,
    location: null,
    start_at: null,
    end_at: null,
    all_day: false,
    start_date: null,
    end_date: null,
    tz: TZ,
    rrule: null,
    area_id: null,
    attention: "low",
    source: "app",
    kind: "event",
    gcal_calendar_id: null,
    gcal_event_id: null,
    gcal_etag: null,
    icloud_calendar_id: null,
    icloud_href: null,
    icloud_etag: null,
    lesson: null,
    is_private: false,
    deleted_at: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

describe("buildAgenda", () => {
  const range = { from: TODAY, to: "2026-11-20" };

  it("mette eventi e attività nel giorno giusto, con ore locali", () => {
    const agenda = buildAgenda(
      range,
      TODAY,
      TZ,
      [task({ title: "Spesa", date: TODAY }), task({ title: "Yoga", date: "2026-11-20", time: "09:00:00" })],
      [
        event({ title: "Riunione", start_at: "2026-11-19T08:00:00Z", end_at: "2026-11-19T09:00:00Z" }),
        event({ title: "Pilates", start_at: "2026-11-12T17:00:00Z", end_at: "2026-11-12T18:00:00Z", rrule: "FREQ=WEEKLY" }),
      ],
      [],
    );
    expect(agenda.days.map((d) => d.weekday)).toHaveLength(2);
    expect(agenda.days[0].events).toEqual([
      { title: "Riunione", all_day: false, start: "09:00", end: "10:00", location: null, kind: "event" },
      { title: "Pilates", all_day: false, start: "18:00", end: "19:00", location: null, kind: "event" },
    ]);
    expect(agenda.days[0].tasks.map((t) => t.title)).toEqual(["Spesa"]);
    expect(agenda.days[1].tasks).toEqual([{ title: "Yoga", time: "09:00", done: false, attention: "low" }]);
  });

  it("riporta le rimaste indietro e quelle nel periodo solo se il periodo comprende oggi", () => {
    const tasks = [task({ title: "Bolletta", date: "2026-11-15" }), task({ title: "Regalo", due_date: "2026-12-10", window_start: TODAY })];
    const agenda = buildAgenda(range, TODAY, TZ, tasks, [], []);
    expect(agenda.overdue).toEqual([{ title: "Bolletta", time: null, done: false, attention: "low", due_date: "2026-11-15" }]);
    expect(agenda.in_window?.map((t) => t.title)).toEqual(["Regalo"]);
    expect(buildAgenda({ from: "2026-11-21", to: "2026-11-22" }, TODAY, TZ, tasks, [], []).overdue).toBeUndefined();
  });

  it("lascia fuori riservati ed eliminati", () => {
    const agenda = buildAgenda(
      range,
      TODAY,
      TZ,
      [],
      [event({ title: "Segreto", all_day: true, start_date: TODAY, is_private: true }), event({ title: "Tolto", all_day: true, start_date: TODAY, deleted_at: "x" })],
      [],
    );
    expect(agenda.days[0].events).toEqual([]);
  });
});

describe("buildLists", () => {
  it("ordina la wishlist per interesse", () => {
    const lists = buildLists(
      [{ name: "Latte di avena", quantity: "2", department: null, urgent: null }],
      [
        { name: "A", brand: null, category: null, price_amount: "12.50", price_currency: "EUR", price_is_estimate: true, interest: 1, url: null },
        { name: "B", brand: null, category: null, price_amount: null, price_currency: null, price_is_estimate: false, interest: 3, url: null },
      ],
    );
    expect(lists.shopping[0].urgent).toBe(false);
    expect(lists.wishlist.map((w) => w.name)).toEqual(["B", "A"]);
    expect(lists.wishlist[1].price).toBe("~ 12,50 €");
  });
});

describe("messaggi e schema", () => {
  it("dice cosa è stato aggiunto e cosa c'era già", () => {
    expect(addedMessage("Spesa", ["pane", "tofu", "riso"], ["latte"])).toBe("Aggiunto alla Spesa: pane, tofu e riso. Già in Spesa: latte.");
  });

  it("le descrizioni restano entro il limite delle Azioni di ChatGPT", () => {
    const spec = openApiSpec("https://example.supabase.co/functions/v1/chatgpt-actions");
    const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
    expect(ops.map((o) => o.operationId)).toEqual(["getAgenda", "getLists", "createTask", "createEvent", "addShoppingItems", "addWishlistItems"]);
    for (const op of ops) expect(op.description.length).toBeLessThanOrEqual(300);
  });
});
