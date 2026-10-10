import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { byId, type Op, type SendOutcome } from "./ops";
import { enqueue, flush, onOutboxChange, pendingCount, pendingEntries } from "./outbox";

const ME = "utente-1";

function op(id: string): Op {
  return { kind: "update", table: "tasks", patch: { status: "done" }, where: byId(id) };
}

function idOf(o: Op): string {
  return o.kind === "insert" ? o.row.id : String(o.where[0][2]);
}

beforeEach(async () => {
  await getDb().outbox.clear();
});

describe("outbox", () => {
  it("conserva le modifiche nell'ordine in cui sono state fatte", async () => {
    await enqueue(ME, [op("a"), op("b")]);
    await enqueue(ME, [op("c")]);
    expect((await pendingEntries(ME)).map((e) => idOf(e.op))).toEqual(["a", "b", "c"]);
  });

  it("le invia in ordine e si svuota", async () => {
    await enqueue(ME, [op("a"), op("b"), op("c")]);
    const seen: string[] = [];
    const result = await flush(ME, async (o) => {
      seen.push(idOf(o));
      return "done";
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ sent: 3, rejected: 0, pending: 0 });
  });

  it("senza rete si ferma e non perde nulla; al giro dopo riparte dallo stesso punto", async () => {
    await enqueue(ME, [op("a"), op("b"), op("c")]);
    const offline = await flush(ME, async (o): Promise<SendOutcome> => (idOf(o) === "b" ? "retry" : "done"));
    expect(offline).toEqual({ sent: 1, rejected: 0, pending: 2 });

    const seen: string[] = [];
    const online = await flush(ME, async (o) => {
      seen.push(idOf(o));
      return "done";
    });
    expect(seen).toEqual(["b", "c"]);
    expect(online.pending).toBe(0);
  });

  it("un errore imprevisto durante l'invio vale come rete assente", async () => {
    await enqueue(ME, [op("a")]);
    const result = await flush(ME, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ sent: 0, rejected: 0, pending: 1 });
  });

  it("scarta una modifica rifiutata e prosegue con le altre", async () => {
    await enqueue(ME, [op("a"), op("b")]);
    const result = await flush(ME, async (o): Promise<SendOutcome> => (idOf(o) === "a" ? "rejected" : "done"));
    expect(result).toEqual({ sent: 1, rejected: 1, pending: 0 });
  });

  it("invia solo le modifiche dell'utente della sessione", async () => {
    await enqueue("altro", [op("x")]);
    await enqueue(ME, [op("a")]);
    const seen: string[] = [];
    await flush(ME, async (o) => {
      seen.push(idOf(o));
      return "done";
    });
    expect(seen).toEqual(["a"]);
    expect(await pendingCount("altro")).toBe(1);
  });

  it("due invii contemporanei non mandano due volte la stessa modifica", async () => {
    await enqueue(ME, [op("a"), op("b")]);
    let calls = 0;
    const send = async (): Promise<SendOutcome> => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return "done";
    };
    await Promise.all([flush(ME, send), flush(ME, send)]);
    expect(calls).toBe(2);
  });

  it("una modifica aggiunta durante l'invio parte nello stesso giro", async () => {
    await enqueue(ME, [op("a")]);
    const seen: string[] = [];
    await flush(ME, async (o) => {
      seen.push(idOf(o));
      if (idOf(o) === "a") await enqueue(ME, [op("b")]);
      return "done";
    });
    expect(seen).toEqual(["a", "b"]);
  });

  it("avvisa a ogni cambiamento", async () => {
    let changes = 0;
    const off = onOutboxChange(() => changes++);
    await enqueue(ME, [op("a")]);
    await flush(ME, async () => "done");
    off();
    expect(changes).toBe(2);
  });
});
