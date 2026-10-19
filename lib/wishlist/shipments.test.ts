import { describe, expect, it } from "vitest";
import type { Occurrence } from "../events/day";
import type { EventRow, WishlistItem } from "../supabase/types";
import { applyToWishlist } from "../sync/ops";
import { answeredKey, arrivalOps, renameOps, askDays, awaitingDecision, matchWanted, returnItems, returnedOps, shipmentKey, shipmentQuestions, waitKey } from "./shipments";

const AT = "2026-10-10T08:00:00.000Z";
const item = (over: Partial<WishlistItem> & { id: string }): WishlistItem =>
  applyToWishlist([], { kind: "insert", table: "wishlist_items", row: { list_id: "l", name: over.id, ...over } }, over.created_at ?? AT)[0];

const event = (id: string, title: string, kind: EventRow["kind"] = "shipment") => ({ id, title, kind, deleted_at: null }) as EventRow;
const occ = (e: EventRow, day: string): Occurrence => ({ key: `${e.id}:${day}`, event: e, allDay: true, start: null, end: null, originalStart: new Date(day), startTime: null, endTime: null, durationMin: null });

describe("pacchi arrivati: domande", () => {
  const zalando = event("z", "📦 Zalando sneakers Veja");
  const amazon = event("a", "📦 Amazon");
  const dinner = event("d", "Cena", "event");

  it("chiede delle spedizioni passate, dalla più recente, una volta per evento (l'ultimo giorno)", () => {
    const days = [
      { day: "2026-10-16", occurrences: [occ(amazon, "2026-10-16")] },
      { day: "2026-10-17", occurrences: [occ(zalando, "2026-10-17"), occ(dinner, "2026-10-17")] },
      { day: "2026-10-18", occurrences: [occ(amazon, "2026-10-18")] },
    ];
    const q = shipmentQuestions(days, [], [], "2026-10-19");
    expect(q.map((x) => [x.event.id, x.day, x.name])).toEqual([
      ["a", "2026-10-18", "Amazon"],
      ["z", "2026-10-17", "Zalando sneakers Veja"],
    ]);
  });

  it("salta le spedizioni già collegate a un articolo e quelle con risposta «Non è arrivato» per quel giorno", () => {
    const days = [{ day: "2026-10-18", occurrences: [occ(zalando, "2026-10-18"), occ(amazon, "2026-10-18")] }];
    const items = [item({ id: "x", shipment_event_id: "z", status: "bought" })];
    expect(shipmentQuestions(days, items, [shipmentKey("a", "2026-10-18")], "2026-10-19")).toEqual([]);
    // Consegna spostata a un altro giorno: si chiede di nuovo.
    expect(shipmentQuestions([{ day: "2026-10-19", occurrences: [occ(amazon, "2026-10-19")] }], items, [shipmentKey("a", "2026-10-18")], "2026-10-19")).toHaveLength(1);
  });

  it("un pacco a cui si è già risposto non torna, anche se l'articolo è stato cancellato", () => {
    const days = [{ day: "2026-10-17", occurrences: [occ(amazon, "2026-10-17")] }];
    const deleted = [{ ...item({ id: "x", shipment_event_id: "a", status: "bought" }), deleted_at: AT }];
    expect(shipmentQuestions(days, deleted, [], "2026-10-19")).toEqual([]);
    expect(shipmentQuestions(days, [], [answeredKey("a")], "2026-10-19")).toEqual([]);
  });

  it("chiede già il giorno della consegna (un pacco può arrivare prima); «Non ancora» vale solo per oggi", () => {
    const days = [{ day: "2026-10-19", occurrences: [occ(amazon, "2026-10-19")] }];
    const q = shipmentQuestions(days, [], [], "2026-10-19");
    expect(q.map((x) => [x.event.id, x.today])).toEqual([["a", true]]);
    expect(shipmentQuestions(days, [], [waitKey("a", "2026-10-19")], "2026-10-19")).toEqual([]);
    // Domani si chiede di nuovo, come per un pacco di ieri.
    const tomorrow = shipmentQuestions(days, [], [waitKey("a", "2026-10-19")], "2026-10-20");
    expect(tomorrow.map((x) => [x.event.id, x.today])).toEqual([["a", false]]);
    // I giorni dopo oggi non contano.
    expect(shipmentQuestions([{ day: "2026-10-20", occurrences: [occ(amazon, "2026-10-20")] }], [], [], "2026-10-19")).toEqual([]);
  });

  it("propone l'articolo della wishlist che somiglia di più, solo se è uno", () => {
    const items = [item({ id: "s", name: "Sneakers bianche", brand: "Veja" }), item({ id: "c", name: "Crema viso" }), item({ id: "b", name: "Sneakers nere", status: "bought" })];
    expect(matchWanted("Zalando sneakers Veja", items)?.id).toBe("s");
    expect(matchWanted("Amazon", items)).toBeNull();
    const tie = [item({ id: "1", name: "Crema mani" }), item({ id: "2", name: "Crema piedi" })];
    expect(matchWanted("Crema", tie)).toBeNull();
    // Accenti e maiuscole non contano.
    expect(matchWanted("CAFFÈ in grani", [item({ id: "k", name: "Caffe" })])?.id).toBe("k");
  });
});

describe("pacchi arrivati: risposte", () => {
  const ctx = { today: "2026-10-19", itemId: "new", taskId: "t", answerId: "q", listId: "l", areaId: "acq" };

  it("«Va bene» crea l'articolo in Acquistati; Annulla lo toglie", () => {
    const { ops, undo } = arrivalOps({ item: null, name: "Amazon", eventId: "a", day: "2026-10-18" }, "keep", ctx);
    expect(ops).toEqual([
      {
        kind: "insert",
        table: "wishlist_items",
        row: { id: "new", list_id: "l", name: "Amazon", source: "manual", status: "bought", shipment_event_id: "a", arrived_on: "2026-10-18", return_by: null, return_task_id: null },
      },
      // La risposta resta salvata anche se poi l'articolo si cancella.
      { kind: "insert", table: "question_answers", row: { id: "q", key: "ship:a", answer: "keep" }, onConflict: "owner_id,key" },
    ]);
    expect(undo).toEqual([
      { kind: "delete", table: "wishlist_items", where: [["id", "eq", "new"]] },
      { kind: "delete", table: "question_answers", where: [["key", "eq", "ship:a"]] },
    ]);
  });

  it("una decisione presa dopo (da Acquisti) non tocca la risposta già salvata", () => {
    const arrived = item({ id: "w", status: "arrived", shipment_event_id: "a", arrived_on: "2026-10-18" });
    const { ops, undo } = arrivalOps({ item: arrived, name: "Amazon", eventId: "a", day: "2026-10-18" }, "keep", ctx);
    expect([...ops, ...undo].some((op) => op.table === "question_answers")).toBe(false);
  });

  it("«Da restituire» programma un'attività entro due settimane, nell'area Acquisti", () => {
    const wish = item({ id: "s", name: "Sneakers" });
    const { ops, undo } = arrivalOps({ item: wish, name: "Zalando", eventId: "z", day: "2026-10-18" }, "return", ctx);
    expect(ops[0]).toEqual({
      kind: "insert",
      table: "tasks",
      row: { id: "t", title: "Restituire Zalando", due_date: "2026-11-02", window_start: "2026-10-19", area_id: "acq", source: "return" },
    });
    expect(ops[1]).toMatchObject({ kind: "update", table: "wishlist_items", patch: { status: "returning", return_by: "2026-11-02", return_task_id: "t", shipment_event_id: "z" } });
    expect(undo[0]).toMatchObject({ patch: { status: "wanted", shipment_event_id: null, return_task_id: null } });
    expect(undo[1]).toEqual({ kind: "delete", table: "tasks", where: [["id", "eq", "t"]] });
  });

  it("«Da restituire» con un nome scelto (un solo articolo del pacco): articolo e attività lo usano", () => {
    const { ops } = arrivalOps({ item: null, name: "maglietta", eventId: "z", day: "2026-10-18" }, "return", ctx);
    expect(ops[0]).toMatchObject({ table: "tasks", row: { title: "Restituire maglietta" } });
    expect(ops[1]).toMatchObject({ table: "wishlist_items", row: { name: "maglietta", status: "returning" } });
    // Articolo della wishlist proposto, nome accorciato: si rinomina, e Annulla rimette il nome di prima.
    const wish = item({ id: "s", name: "Stivaletti e maglietta" });
    const linked = arrivalOps({ item: wish, name: "maglietta", eventId: "z", day: "2026-10-18" }, "return", ctx);
    expect(linked.ops[1]).toMatchObject({ table: "wishlist_items", patch: { name: "maglietta" } });
    expect(linked.undo[0]).toMatchObject({ patch: { name: "Stivaletti e maglietta" } });
  });

  it("rinominare un articolo da restituire aggiorna il titolo dell'attività, se non è stato cambiato a mano", () => {
    const it = item({ id: "r", name: "Zalando – stivaletti e maglietta", status: "returning", return_task_id: "t" });
    expect(renameOps(it, "Zalando – maglietta")[1]).toEqual({
      kind: "update",
      table: "tasks",
      patch: { title: "Restituire Zalando – maglietta" },
      where: [["id", "eq", "t"], ["title", "eq", "Restituire Zalando – stivaletti e maglietta"]],
    });
    expect(renameOps(item({ id: "w", name: "Crema" }), "Crema viso")).toHaveLength(1);
  });

  it("«Ci penso più tardi» lo lascia tra quelli da decidere", () => {
    const { ops } = arrivalOps({ item: null, name: "Amazon", eventId: "a", day: "2026-10-18" }, "later", ctx);
    const items = ops.reduce<WishlistItem[]>((rows, op) => applyToWishlist(rows, op, AT), []);
    expect(awaitingDecision(items).map((i) => i.name)).toEqual(["Amazon"]);
  });

  it("«Restituito» chiude l'attività ancora aperta; Annulla la riapre", () => {
    const it = item({ id: "r", status: "returning", return_task_id: "t" });
    const { ops, undo } = returnedOps(it, AT);
    expect(ops[1]).toEqual({ kind: "update", table: "tasks", patch: { status: "done", completed_at: AT }, where: [["id", "eq", "t"], ["status", "eq", "open"]] });
    expect(undo[0]).toMatchObject({ patch: { status: "returning" } });
  });

  it("i resi: prima da restituire per scadenza, poi i restituiti", () => {
    const items = [
      item({ id: "late", status: "returning", return_by: "2026-11-05" }),
      item({ id: "soon", status: "returning", return_by: "2026-10-25" }),
      item({ id: "done", status: "returned" }),
    ];
    const r = returnItems(items);
    expect(r.returning.map((i) => i.id)).toEqual(["soon", "late"]);
    expect(r.returned.map((i) => i.id)).toEqual(["done"]);
  });

  it("guarda i sette giorni prima di oggi e oggi", () => {
    expect(askDays("2026-10-19")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
  });
});
