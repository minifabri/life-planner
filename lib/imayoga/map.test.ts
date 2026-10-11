import { describe, expect, it } from "vitest";
import { isEmptyIndividualSlot, lessonTitle, planSync, toLessonEvents, type FeedItem, type LessonDetails, type LocalLesson, type WantedLesson } from "./map";

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    kind: "class",
    id: "c1",
    starts_on: "2026-10-12",
    starts_at: "19:15:00",
    title: "Ashtanga",
    level_name: "Intermedio",
    location: null,
    is_individual: false,
    booked_count: 0,
    assigned: false,
    ...over,
  };
}

describe("lezione → evento", () => {
  it("dura un'ora e parte all'ora italiana (ora legale)", () => {
    const [event] = toLessonEvents([item()]);
    expect(event).toEqual({
      key: "imayoga:class:c1",
      title: "Ashtanga · Intermedio",
      location: null,
      start_at: "2026-10-12T17:15:00.000Z",
      end_at: "2026-10-12T18:15:00.000Z",
      tz: "Europe/Rome",
      lesson: { individual: false, capacity: null, booked: [], waitlist: [], assigned: null },
    });
  });

  it("porta con sé posti, prenotati e lista d'attesa, senza metterli nel titolo", () => {
    const [event] = toLessonEvents([item({ capacity: 8, booked: ["Anna Bianchi", " Marta Verdi "], waitlist: ["Sara Neri"], booked_count: 2 })]);
    expect(event.title).toBe("Ashtanga · Intermedio");
    expect(event.lesson).toEqual({ individual: false, capacity: 8, booked: ["Anna Bianchi", "Marta Verdi"], waitlist: ["Sara Neri"], assigned: null });
  });

  it("una lezione individuale ricorda l'allieva assegnata", () => {
    const [event] = toLessonEvents([item({ is_individual: true, assigned: true, assigned_name: "Anna Bianchi" })]);
    expect(event.title).toBe("Lezione individuale");
    expect(event.lesson?.assigned).toBe("Anna Bianchi");
  });

  it("un evento di imayoga non ha prenotazioni", () => {
    expect(toLessonEvents([item({ kind: "event", title: "Ritiro" })])[0].lesson).toBeNull();
  });

  it("tiene conto del passaggio all'ora solare", () => {
    const [event] = toLessonEvents([item({ starts_on: "2026-10-26", starts_at: "18:00:00" })]);
    expect(event.start_at).toBe("2026-10-26T17:00:00.000Z");
    expect(event.end_at).toBe("2026-10-26T18:00:00.000Z");
  });

  it("una lezione di gruppo senza prenotati resta comunque in calendario", () => {
    expect(toLessonEvents([item({ booked_count: 0 })])).toHaveLength(1);
  });

  it("porta dentro gli eventi con il loro luogo", () => {
    const [event] = toLessonEvents([
      item({ kind: "event", id: "e1", title: "Sunday Escape", level_name: null, location: " Orte ", starts_at: "10:00:00" }),
    ]);
    expect(event).toMatchObject({ key: "imayoga:event:e1", title: "Sunday Escape", location: "Orte" });
  });

  it("salta le righe con data o ora illeggibili", () => {
    expect(toLessonEvents([item({ starts_at: "" }), item({ starts_on: "12/10/2026" })])).toEqual([]);
  });
});

describe("lezioni individuali", () => {
  it("lo slot vuoto resta fuori", () => {
    const empty = item({ is_individual: true, title: null });
    expect(isEmptyIndividualSlot(empty)).toBe(true);
    expect(toLessonEvents([empty])).toEqual([]);
  });

  it("entra quando qualcuno ha prenotato", () => {
    expect(toLessonEvents([item({ is_individual: true, booked_count: 1 })])).toHaveLength(1);
  });

  it("entra quando è stata assegnata a un'allieva, anche senza prenotazione registrata", () => {
    expect(toLessonEvents([item({ is_individual: true, assigned: true })])).toHaveLength(1);
  });

  it("il titolo non dice chi è l'allieva né il tipo", () => {
    expect(lessonTitle(item({ is_individual: true, title: "Altro", booked_count: 1 }))).toBe("Lezione individuale");
  });
});

describe("titoli", () => {
  it("tipo e livello, o quello che c'è", () => {
    expect(lessonTitle(item())).toBe("Ashtanga · Intermedio");
    expect(lessonTitle(item({ level_name: null }))).toBe("Ashtanga");
    expect(lessonTitle(item({ title: null }))).toBe("Intermedio");
    expect(lessonTitle(item({ title: " ", level_name: null }))).toBe("Lezione di yoga");
  });
});

describe("confronto con gli eventi già nel planner", () => {
  const DETAILS: LessonDetails = { individual: false, capacity: 8, booked: [], waitlist: [], assigned: null };
  const wanted = (over: Partial<WantedLesson> = {}): WantedLesson => ({
    id: "a",
    key: "imayoga:class:c1",
    title: "Ashtanga · Intermedio",
    location: null,
    start_at: "2026-10-12T17:15:00.000Z",
    end_at: "2026-10-12T18:15:00.000Z",
    tz: "Europe/Rome",
    lesson: DETAILS,
    ...over,
  });
  const local = (over: Partial<LocalLesson> = {}): LocalLesson => ({
    id: "a",
    title: "Ashtanga · Intermedio",
    location: null,
    // Il database restituisce lo stesso istante scritto in un altro modo.
    start_at: "2026-10-12T17:15:00+00:00",
    end_at: "2026-10-12T18:15:00+00:00",
    lesson: DETAILS,
    deleted_at: null,
    ...over,
  });
  const START = "2026-09-10";

  it("aggiorna una lezione quando cambiano i prenotati", () => {
    const booked = wanted({ lesson: { ...DETAILS, booked: ["Anna Bianchi"] } });
    expect(planSync([local()], [booked], START).update).toEqual([booked]);
    // Una lezione letta prima che esistesse il dettaglio lo riceve alla prima sync.
    expect(planSync([local({ lesson: null })], [wanted()], START).update).toEqual([wanted()]);
  });

  it("crea le lezioni nuove", () => {
    expect(planSync([], [wanted()], START)).toEqual({ create: [wanted()], update: [], remove: [] });
  });

  it("una seconda sync senza novità non scrive nulla", () => {
    expect(planSync([local()], [wanted()], START)).toEqual({ create: [], update: [], remove: [] });
  });

  it("aggiorna una lezione spostata o rinominata", () => {
    const moved = wanted({ start_at: "2026-10-12T16:00:00.000Z", end_at: "2026-10-12T17:00:00.000Z" });
    expect(planSync([local()], [moved], START).update).toEqual([moved]);
    const renamed = wanted({ title: "Yoga Flow · Intermedio" });
    expect(planSync([local()], [renamed], START).update).toEqual([renamed]);
  });

  it("toglie una lezione eliminata o tolta dalla pubblicazione", () => {
    expect(planSync([local()], [], START).remove).toEqual(["a"]);
  });

  it("riporta in vita una lezione ripubblicata", () => {
    const plan = planSync([local({ deleted_at: "2026-10-01T10:00:00+00:00" })], [wanted()], START);
    expect(plan).toEqual({ create: [], update: [wanted()], remove: [] });
  });

  it("non tocca una lezione già tolta", () => {
    expect(planSync([local({ deleted_at: "2026-10-01T10:00:00+00:00" })], [], START).remove).toEqual([]);
  });

  it("una lezione passata uscita dal periodo resta come storico", () => {
    const old = local({ start_at: "2026-09-07T17:00:00+00:00", end_at: "2026-09-07T18:00:00+00:00" });
    expect(planSync([old], [], START).remove).toEqual([]);
  });
});
