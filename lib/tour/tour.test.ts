import { describe, expect, it } from "vitest";
import { CALENDAR_TOUR, INTRO_TOUR, TOURS, TOUR_LABEL, autoTour, hasSeen, padRect, placeCard, unionRect, visibleSteps, withSeen, type TourId } from "./tour";

describe("tour visti", () => {
  it("riconosce un tour già visto, anche senza profilo", () => {
    expect(hasSeen(["intro"], "intro")).toBe(true);
    expect(hasSeen([], "intro")).toBe(false);
    expect(hasSeen(null, "intro")).toBe(false);
  });

  it("aggiunge un tour senza doppioni", () => {
    expect(withSeen(null, "intro")).toEqual(["intro"]);
    expect(withSeen(["intro"], "intro")).toEqual(["intro"]);
    expect(withSeen(["log"], "intro")).toEqual(["intro", "log"]);
  });
});

describe("passi visibili", () => {
  it("salta i passi il cui elemento non c'è e tiene quelli senza elemento", () => {
    const steps = visibleSteps(INTRO_TOUR, (t) => t !== "lists" && t !== "quick-add");
    expect(steps.map((s) => s.target)).not.toContain("lists");
    expect(steps.map((s) => s.target)).not.toContain("quick-add");
    expect(steps[0].target).toBeUndefined();
    expect(steps.at(-1)!.target).toBeUndefined();
    expect(steps).toHaveLength(INTRO_TOUR.length - 2);
  });

  it("i testi non danno per scontato il genere di chi usa l'app", () => {
    const text = INTRO_TOUR.map((s) => `${s.title} ${s.body}`).join(" ");
    // "il benvenuto" è un nome e va bene; "Benvenuta!" o "Benvenuto!" come saluto no.
    expect(text).not.toMatch(/(^|[.!?] )benvenut[aoie]\b/i);
    expect(text).not.toMatch(/\bbenvenut[aei]\b/i);
    expect(text).not.toMatch(/\bsei (pront|stanc|brav)[ao]\b/i);
  });
});

describe("rettangoli", () => {
  it("unisce più elementi in un solo riflettore", () => {
    expect(unionRect([])).toBeNull();
    expect(
      unionRect([
        { left: 10, top: 100, width: 200, height: 38 },
        { left: 10, top: 140, width: 200, height: 38 },
        { left: 12, top: 220, width: 190, height: 38 },
      ]),
    ).toEqual({ left: 10, top: 100, width: 200, height: 158 });
  });

  it("allarga il rettangolo su ogni lato", () => {
    expect(padRect({ left: 10, top: 10, width: 20, height: 20 }, 6)).toEqual({ left: 4, top: 4, width: 32, height: 32 });
  });
});

describe("posizione del fumetto", () => {
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1440, height: 900 };
  const card = { height: 180 };

  it("senza elemento sta al centro", () => {
    expect(placeCard({ target: null, viewport: phone, card })).toEqual({ left: 16, top: 332, width: 358 });
  });

  it("sopra un pulsante della barra in basso", () => {
    const plus = { left: 168, top: 770, width: 54, height: 54 };
    const p = placeCard({ target: plus, viewport: phone, card });
    expect(p.top + card.height).toBeLessThanOrEqual(plus.top);
    expect(p.left).toBe(16);
  });

  it("sotto un elemento in alto", () => {
    const bar = { left: 20, top: 140, width: 350, height: 4 };
    expect(placeCard({ target: bar, viewport: phone, card }).top).toBe(158);
  });

  it("a destra della barra laterale su desktop", () => {
    const nav = { left: 14, top: 300, width: 204, height: 38 };
    const p = placeCard({ target: nav, viewport: desktop, card });
    expect(p.left).toBe(232);
    expect(p.width).toBe(360);
    expect(p.top).toBe(229);
  });

  it("resta dentro lo schermo anche vicino ai bordi", () => {
    const corner = { left: 1380, top: 10, width: 44, height: 44 };
    const p = placeCard({ target: corner, viewport: desktop, card });
    expect(p.left + p.width).toBeLessThanOrEqual(desktop.width - 16);
    expect(p.top).toBe(68);
  });
});

describe("tour di sezione", () => {
  const sections = (Object.keys(TOURS) as TourId[]).filter((id) => id !== "intro");

  it("ogni sezione ha da 2 a 4 passi, ognuno su un elemento, e un nome per le Impostazioni", () => {
    for (const id of sections) {
      expect(TOUR_LABEL[id]).toBeTruthy();
      // Due versioni dello stesso passo (desktop e iPhone) contano una volta sola: contiamo i titoli.
      const titles = new Set(TOURS[id].map((s) => s.title));
      expect(titles.size, id).toBeGreaterThanOrEqual(2);
      expect(titles.size, id).toBeLessThanOrEqual(4);
      expect(TOURS[id].every((s) => s.target)).toBe(true);
    }
  });

  it("il calendario mostra il trascinamento su desktop e il + su iPhone", () => {
    const desktop = visibleSteps(CALENDAR_TOUR, (t) => t !== "calendar-days");
    const phone = visibleSteps(CALENDAR_TOUR, (t) => t === "calendar-days");
    expect(desktop.map((s) => s.title)).toEqual(["Sposta trascinando", "Fissa le cose «entro»", "I segni discreti"]);
    expect(phone.map((s) => s.title)).toEqual(["Aggiungi senza passare da Oggi", "I segni discreti"]);
  });

  it("testi neutri e, se parlano di cibo, solo vegani", () => {
    const text = Object.values(TOURS)
      .flat()
      .map((s) => `${s.title} ${s.body}`)
      .join(" ");
    expect(text).not.toMatch(/\bbenvenut[aei]\b/i);
    expect(text).not.toMatch(/\bsei (pront|stanc|brav)[ao]\b/i);
    // "latte" solo vegetale ("latte d'avena"), mai da solo.
    expect(text).not.toMatch(/\blatte\b(?! d'avena| di soia| di riso)/i);
    expect(text).not.toMatch(/\b(carne|pollo|pesce|tonno|salmone|uov[ao]|formaggio|burro|yogurt|miele|prosciutto)\b/i);
  });
});

describe("partenza automatica", () => {
  const pages: Record<TourId, string> = {
    intro: "/today",
    calendar: "/calendar/week",
    shopping: "/lists/shopping",
    meals: "/lists/meals",
    wishlist: "/lists/wishlist",
    wardrobe: "/lists/wardrobe",
    medicines: "/lists/medicines",
    log: "/log",
  };

  it("finché il tour iniziale non è visto, parte solo quello e solo su Oggi", () => {
    expect(autoTour([], "/today", pages)).toBe("intro");
    expect(autoTour(null, "/log", pages)).toBeNull();
    expect(autoTour(["log"], "/today", pages)).toBe("intro");
  });

  it("poi parte il tour della sezione aperta, una volta sola", () => {
    expect(autoTour(["intro"], "/log", pages)).toBe("log");
    expect(autoTour(["intro", "log"], "/log", pages)).toBeNull();
    expect(autoTour(["intro"], "/today", pages)).toBeNull();
    expect(autoTour(["intro"], "/calendar/month", pages)).toBeNull();
    expect(autoTour(["intro"], "/settings", pages)).toBeNull();
  });
});
