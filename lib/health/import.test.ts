import { describe, expect, it } from "vitest";
import { activityName, disciplineKey, importMessage, parseHealthPayload, planHealthImport, type ExistingWorkout, type HealthWorkout } from "./import";

function parseOne(raw: Record<string, unknown>, tz = "Europe/Rome"): HealthWorkout {
  const parsed = parseHealthPayload({ workouts: [raw] }, tz);
  expect(parsed?.workouts).toHaveLength(1);
  return parsed!.workouts[0];
}

function health(over: Partial<HealthWorkout> = {}): HealthWorkout {
  return {
    health_id: "h1",
    activity: "Corsa",
    date: "2026-10-12",
    time: "18:30",
    ended_at: "2026-10-12T17:15:00.000Z",
    duration_min: 45,
    distance_m: 5200,
    energy_kcal: 312,
    avg_hr: 148,
    ...over,
  };
}

function existing(over: Partial<ExistingWorkout> = {}): ExistingWorkout {
  return { id: "w1", activity: "Corsa", date: "2026-10-12", time: null, status: "planned", health_id: null, deleted_at: null, ...over };
}

describe("discipline", () => {
  it("riconosce i nomi di Salute in italiano e in inglese", () => {
    expect(activityName("Outdoor Run")).toBe("Corsa");
    expect(activityName("Corsa indoor")).toBe("Corsa");
    expect(activityName("Allenamento funzionale della forza")).toBe("Forza");
    expect(activityName("Traditional Strength Training")).toBe("Forza");
    expect(activityName("Indoor Cycle")).toBe("Bici");
    expect(activityName("Pool Swim")).toBe("Nuoto");
    expect(activityName("Hiking")).toBe("Escursione");
    expect(activityName("Walking")).toBe("Camminata");
  });

  it("tiene il nome di ciò che non riconosce, e ne dà uno a ciò che non ha nome", () => {
    expect(activityName("  tai  chi ")).toBe("Tai chi");
    expect(activityName("")).toBe("Allenamento");
  });

  it("confronta le discipline senza badare a come sono scritte", () => {
    expect(disciplineKey("Corsa lenta")).toBe(disciplineKey("Running"));
    expect(disciplineKey("Palestra")).toBe(disciplineKey("Functional Strength Training"));
    expect(disciplineKey("Yoga")).not.toBe(disciplineKey("Pilates"));
    expect(disciplineKey("Crunch")).not.toBe(disciplineKey("Run"));
  });
});

describe("lettura di ciò che manda il Comando rapido", () => {
  it("porta giorno e ora nel fuso del profilo", () => {
    const w = parseOne({ type: "Running", start: "2026-10-12T16:30:00Z", end: "2026-10-12T17:15:00Z" });
    expect(w).toMatchObject({ activity: "Corsa", date: "2026-10-12", time: "18:30", duration_min: 45, ended_at: "2026-10-12T17:15:00.000Z" });
  });

  it("un allenamento a cavallo della mezzanotte UTC resta nel giorno locale", () => {
    const w = parseOne({ type: "Yoga", start: "2026-10-12T23:30:00+02:00" });
    expect(w).toMatchObject({ date: "2026-10-12", time: "23:30" });
    expect(parseOne({ type: "Yoga", start: "2026-10-12T22:30:00Z" })).toMatchObject({ date: "2026-10-13", time: "00:30" });
  });

  it("una data senza fuso vale come ora del profilo", () => {
    const w = parseOne({ type: "Yoga", start: "2026-10-12T18:30:00", duration_min: 60 });
    expect(w).toMatchObject({ date: "2026-10-12", time: "18:30", ended_at: "2026-10-12T17:30:00.000Z" });
  });

  it("rispetta ora legale, ora solare e altri fusi", () => {
    expect(parseOne({ start: "2026-01-12T18:30:00", duration_min: 30 }).ended_at).toBe("2026-01-12T18:00:00.000Z");
    expect(parseOne({ start: "2026-10-25T08:00:00", duration_min: 30 }).ended_at).toBe("2026-10-25T07:30:00.000Z");
    expect(parseOne({ start: "2026-10-12T16:30:00Z" }, "America/New_York")).toMatchObject({ date: "2026-10-12", time: "12:30" });
    expect(parseOne({ start: "2026-10-12T16:30:00Z" }, "Fuso/Inesistente")).toMatchObject({ time: "18:30" });
  });

  it("legge le misure con o senza unità", () => {
    expect(parseOne({ type: "Corsa", start: "2026-10-12T18:30:00+02:00", duration: "45:12", energy: "312 kcal", distance: "5,2 km", avg_hr: "148 bpm" })).toMatchObject({
      duration_min: 45,
      energy_kcal: 312,
      distance_m: 5200,
      avg_hr: 148,
    });
    expect(parseOne({ start: "2026-10-12T18:30:00+02:00", duration: "1:02:33", distance: "800 m", energy: "1.234 kcal" })).toMatchObject({
      duration_min: 63,
      distance_m: 800,
      energy_kcal: 1234,
    });
    expect(parseOne({ start: "2026-10-12T18:30:00+02:00", distance: 5.2, energy_kcal: 312.6, duration: 30 })).toMatchObject({
      distance_m: 5200,
      energy_kcal: 313,
      duration_min: 30,
    });
    expect(parseOne({ start: "2026-10-12T18:30:00+02:00", distance: 5200, energy: "1305 kJ", distance_km: null })).toMatchObject({ distance_m: 5200, energy_kcal: 312 });
    expect(parseOne({ start: "2026-10-12T18:30:00+02:00", distance: "3.1 mi" }).distance_m).toBe(4989);
  });

  it("ciò che manca o vale zero resta vuoto", () => {
    expect(parseOne({ type: "Yoga", start: "2026-10-12T18:30:00+02:00", distance: "0 km", energy: "", avg_hr: 0 })).toMatchObject({
      duration_min: null,
      distance_m: null,
      energy_kcal: null,
      avg_hr: null,
    });
  });

  it("usa l'identificativo di Salute, o ne ricava uno stabile da inizio e disciplina", () => {
    expect(parseOne({ id: " ABC-1 ", type: "Run", start: "2026-10-12T18:30:00+02:00" }).health_id).toBe("ABC-1");
    const a = parseOne({ type: "Outdoor Run", start: "2026-10-12T18:30:00+02:00" });
    const b = parseOne({ type: "Corsa", start: "2026-10-12T16:30:00Z" });
    expect(a.health_id).toBe("2026-10-12T18:30|corsa");
    expect(b.health_id).toBe(a.health_id);
  });

  it("accetta anche l'elenco da solo e scarta le voci senza inizio", () => {
    const parsed = parseHealthPayload([{ type: "Yoga", start: "2026-10-12T18:30:00+02:00" }, { type: "Yoga" }, "x", { start: "ieri" }]);
    expect(parsed?.workouts).toHaveLength(1);
    expect(parsed?.rejected).toBe(3);
  });

  it("rifiuta ciò che non è un elenco o è troppo lungo", () => {
    expect(parseHealthPayload(null)).toBeNull();
    expect(parseHealthPayload({ workouts: "x" })).toBeNull();
    expect(parseHealthPayload(Array.from({ length: 201 }, () => ({})))).toBeNull();
  });
});

describe("abbinamento", () => {
  it("completa l'allenamento in programma dello stesso giorno e disciplina", () => {
    const plan = planHealthImport([health()], [existing({ activity: "Corsa lenta" })]);
    expect(plan.create).toHaveLength(0);
    expect(plan.complete).toEqual([
      {
        id: "w1",
        patch: { status: "done", health_id: "h1", completed_at: "2026-10-12T17:15:00.000Z", time: "18:30", duration_min: 45, distance_m: 5200, energy_kcal: 312, avg_hr: 148 },
      },
    ]);
  });

  it("non cancella l'orario scelto né le misure scritte a mano quando Salute non le ha", () => {
    const plan = planHealthImport([health({ distance_m: null, avg_hr: null })], [existing({ time: "07:00:00" })]);
    expect(plan.complete[0].patch).toEqual({ status: "done", health_id: "h1", completed_at: "2026-10-12T17:15:00.000Z", duration_min: 45, energy_kcal: 312 });
  });

  it("un allenamento già segnato come fatto tiene il suo momento di completamento", () => {
    const plan = planHealthImport([health()], [existing({ status: "done" })]);
    expect(plan.create).toHaveLength(0);
    expect(plan.complete[0].patch).not.toHaveProperty("completed_at");
    expect(plan.complete[0].patch.health_id).toBe("h1");
  });

  it("senza un allenamento in programma ne crea uno già fatto", () => {
    const plan = planHealthImport([health()], [existing({ activity: "Yoga" }), existing({ id: "w2", date: "2026-10-13" })]);
    expect(plan.complete).toHaveLength(0);
    expect(plan.create).toEqual([
      { health_id: "h1", activity: "Corsa", date: "2026-10-12", time: "18:30", duration_min: 45, distance_m: 5200, energy_kcal: 312, avg_hr: 148, status: "done", completed_at: "2026-10-12T17:15:00.000Z", source: "health" },
    ]);
  });

  it("un secondo invio non duplica, nemmeno se l'allenamento è stato eliminato nell'app", () => {
    const plan = planHealthImport([health(), health({ health_id: "h2" })], [existing({ health_id: "h1", status: "done" }), existing({ id: "w2", health_id: "h2", deleted_at: "2026-10-12T20:00:00Z" })]);
    expect(plan).toEqual({ complete: [], create: [], known: 2 });
  });

  it("lo stesso allenamento ripetuto nello stesso invio conta una volta", () => {
    const plan = planHealthImport([health(), health()], []);
    expect(plan.create).toHaveLength(1);
    expect(plan.known).toBe(1);
  });

  it("non riusa un allenamento eliminato né uno già abbinato", () => {
    const plan = planHealthImport([health()], [existing({ deleted_at: "2026-10-11T08:00:00Z" }), existing({ id: "w2", health_id: "altro", status: "done" })]);
    expect(plan.complete).toHaveLength(0);
    expect(plan.create).toHaveLength(1);
  });

  it("due allenamenti nello stesso giorno: ognuno prende quello più vicino per orario, il terzo si aggiunge", () => {
    const plan = planHealthImport(
      [health({ health_id: "sera", time: "18:30" }), health({ health_id: "mattina", time: "07:10" }), health({ health_id: "notte", time: "22:00" })],
      [existing({ id: "p-sera", time: "19:00:00" }), existing({ id: "p-mattina", time: "07:00:00" })],
    );
    expect(plan.complete.map((c) => [c.id, c.patch.health_id])).toEqual([
      ["p-mattina", "mattina"],
      ["p-sera", "sera"],
    ]);
    expect(plan.create.map((c) => c.health_id)).toEqual(["notte"]);
  });

  it("preferisce l'allenamento ancora da fare a quello già fatto", () => {
    const plan = planHealthImport([health()], [existing({ id: "fatto", status: "done", time: "18:30:00" }), existing({ id: "da-fare", time: "08:00:00" })]);
    expect(plan.complete[0].id).toBe("da-fare");
  });
});

describe("frase di risposta", () => {
  it("dice che cosa è successo", () => {
    expect(importMessage({ complete: [], create: [], known: 3 })).toBe("Nessun allenamento nuovo.");
    const one = planHealthImport([health()], [existing()]);
    expect(importMessage(one)).toBe("Allenamenti: 1 completato.");
    const two = planHealthImport([health(), health({ health_id: "h2", activity: "Yoga" }), health({ health_id: "h3", activity: "Nuoto" })], [existing()]);
    expect(importMessage(two, 1)).toBe("Allenamenti: 1 completato, 2 aggiunti, 1 non letto.");
  });
});
