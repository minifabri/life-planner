import { describe, expect, it } from "vitest";
import { eveningHeading, greeting, morningOverview, nextDeadline, overviewMode } from "./overview";

const TODAY = "2026-10-09"; // venerdì

type T = Parameters<typeof nextDeadline>[0][number];
const task = (over: Partial<T> = {}): T => ({
  title: "Attività",
  due_date: null,
  date: null,
  status: "open",
  attention: "low",
  deleted_at: null,
  ...over,
});

describe("overviewMode e saluto", () => {
  it("panoramica fino all'ora della review, poi la review", () => {
    expect(overviewMode("07:10", "20:30:00")).toBe("morning");
    expect(overviewMode("20:29", "20:30:00")).toBe("morning");
    expect(overviewMode("20:30", "20:30:00")).toBe("evening");
    expect(overviewMode("23:50")).toBe("evening");
  });

  it("il saluto segue l'ora", () => {
    expect(greeting("08:00")).toBe("Buongiorno");
    expect(greeting("14:47")).toBe("Buon pomeriggio");
    expect(greeting("21:00")).toBe("Buonasera");
    expect(greeting("19:00", "18:00:00")).toBe("Buonasera");
  });
});

describe("nextDeadline", () => {
  it("prende la scadenza più vicina dei prossimi sei giorni, oggi escluso", () => {
    const tasks = [
      task({ title: "Oggi", due_date: TODAY }),
      task({ title: "Lontana", due_date: "2026-10-31" }),
      task({ title: "Lunedì", due_date: "2026-10-12" }),
      task({ title: "Domenica", due_date: "2026-10-11" }),
    ];
    expect(nextDeadline(tasks, TODAY)?.title).toBe("Domenica");
  });

  it("a parità di giorno vince l'attenzione alta; ignora chiuse, eliminate e già messe in un giorno", () => {
    const tasks = [
      task({ title: "Bassa", due_date: "2026-10-12" }),
      task({ title: "Alta", due_date: "2026-10-12", attention: "high" }),
      task({ title: "Fatta", due_date: "2026-10-10", status: "done" }),
      task({ title: "Eliminata", due_date: "2026-10-10", deleted_at: "2026-10-09T08:00:00Z" }),
      task({ title: "In un giorno", due_date: "2026-10-10", date: "2026-10-10" }),
    ];
    expect(nextDeadline(tasks, TODAY)?.title).toBe("Alta");
    expect(nextDeadline([], TODAY)).toBeNull();
  });
});

describe("morningOverview", () => {
  const base = { nowTime: "08:00", today: TODAY, events: 0, openTasks: [], overdue: 0, allTasks: [] };

  it("la frase del prototipo", () => {
    const out = morningOverview({
      ...base,
      name: "Bibi",
      events: 3,
      openTasks: [{ due_date: TODAY }, ...Array.from({ length: 7 }, () => ({ due_date: null }))],
      allTasks: [task({ title: "Rinnovo assicurazione auto", due_date: "2026-10-12" })],
    });
    expect(out.text).toBe("Buongiorno, Bibi. Oggi 3 appuntamenti e 8 attività; una scade oggi.");
    expect(out.note).toBe("Lunedì scade «Rinnovo assicurazione auto».");
  });

  it("carico e rimaste indietro in coda", () => {
    const out = morningOverview({ ...base, name: " ", events: 1, openTasks: [{ due_date: null }], overdue: 2, loadLabel: "Giornata media" });
    expect(out.text).toBe("Buongiorno. Oggi 1 appuntamento e 1 attività. Giornata media, 2 rimaste indietro.");
    expect(out.note).toBeNull();
  });

  it("giornata vuota, più scadenze oggi, scadenza domani", () => {
    expect(morningOverview({ ...base, nowTime: "15:00", loadLabel: "Giornata libera" }).text).toBe("Buon pomeriggio. Oggi niente in programma.");
    expect(morningOverview({ ...base, openTasks: [{ due_date: TODAY }, { due_date: TODAY }], overdue: 1 }).text).toBe(
      "Buongiorno. Oggi 2 attività; 2 scadono oggi. 1 rimasta indietro.",
    );
    expect(morningOverview({ ...base, allTasks: [task({ title: "Bolletta", due_date: "2026-10-10" })] }).note).toBe("Domani scade «Bolletta».");
  });
});

describe("eveningHeading", () => {
  it("conta ciò che resta aperto", () => {
    expect(eveningHeading("Bibi", 0)).toBe("Buonasera, Bibi. Tutto fatto per oggi.");
    expect(eveningHeading("Bibi", 1)).toBe("Buonasera, Bibi. Resta un'attività aperta.");
    expect(eveningHeading(null, 3)).toBe("Buonasera. Restano 3 attività aperte.");
  });
});
