import { describe, expect, it } from "vitest";
import { completePatch, movePatch, quickDates, reopenPatch } from "./actions";
import { dayLoad } from "./load";

describe("movePatch", () => {
  it("ricorda il giorno di partenza la prima volta", () => {
    expect(movePatch({ date: "2026-10-08", due_date: null, original_date: null }, "2026-10-10")).toEqual({
      date: "2026-10-10",
      original_date: "2026-10-08",
    });
  });

  it("non sovrascrive il giorno originale ai rinvii successivi", () => {
    expect(movePatch({ date: "2026-10-10", due_date: null, original_date: "2026-10-08" }, "2026-10-12")).toEqual({
      date: "2026-10-12",
    });
  });

  it("per un'attività nel periodo parte dalla fine della finestra", () => {
    expect(movePatch({ date: null, due_date: "2026-10-09", original_date: null }, "2026-10-10")).toEqual({
      date: "2026-10-10",
      original_date: "2026-10-09",
    });
  });

  it("senza giorno di partenza imposta solo la data", () => {
    expect(movePatch({ date: null, due_date: null, original_date: null }, "2026-10-10")).toEqual({ date: "2026-10-10" });
  });
});

describe("completamento", () => {
  it("segna e toglie il completamento", () => {
    const now = new Date("2026-10-10T09:00:00Z");
    expect(completePatch(now)).toEqual({ status: "done", completed_at: "2026-10-10T09:00:00.000Z" });
    expect(reopenPatch()).toEqual({ status: "open", completed_at: null });
  });
});

describe("quickDates", () => {
  it("propone domani, lunedì e fra una settimana", () => {
    expect(quickDates("2026-10-10")).toEqual([
      { label: "Domani", date: "2026-10-11" },
      { label: "Lunedì", date: "2026-10-12" },
      { label: "Fra una settimana", date: "2026-10-17" },
    ]);
  });

  it("di domenica non ripete lunedì, di lunedì non ripete fra una settimana", () => {
    expect(quickDates("2026-10-11").map((d) => d.label)).toEqual(["Domani", "Fra una settimana"]);
    expect(quickDates("2026-10-12").map((d) => d.label)).toEqual(["Domani", "Lunedì"]);
  });
});

describe("dayLoad", () => {
  it("somma le durate e assegna un livello", () => {
    expect(dayLoad([]).level).toBe("empty");
    expect(dayLoad([45, null, 60]).level).toBe("light");
    expect(dayLoad([120, 90]).level).toBe("medium");
    expect(dayLoad([240, 180]).level).toBe("full");
    expect(dayLoad([600]).ratio).toBe(1);
  });
});
