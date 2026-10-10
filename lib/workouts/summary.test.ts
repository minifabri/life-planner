import { describe, expect, it } from "vitest";
import type { Workout } from "../supabase/types";
import {
  DEFAULT_ACTIVITIES,
  activitySuggestions,
  formatDistance,
  groupByWeek,
  parseKm,
  shownStatus,
  summarize,
  summaryLabel,
  workoutsOfDay,
} from "./summary";

// Sabato 10 ottobre 2026: la settimana va da lunedì 5 a domenica 11.
const TODAY = "2026-10-10";

function workout(over: Partial<Workout> & { id: string; date: string }): Workout {
  return {
    activity: over.id,
    time: null,
    duration_min: null,
    notes: null,
    status: "planned",
    completed_at: null,
    distance_m: null,
    energy_kcal: null,
    avg_hr: null,
    source: "app",
    health_id: null,
    deleted_at: null,
    created_at: `${over.date}T08:00:00Z`,
    updated_at: `${over.date}T08:00:00Z`,
    ...over,
  };
}

const week = [
  workout({ id: "corsa", date: "2026-10-05", status: "done", duration_min: 45 }),
  workout({ id: "forza", date: "2026-10-07", status: "done", duration_min: 60 }),
  workout({ id: "pilates", date: "2026-10-08" }),
  workout({ id: "nuoto", date: "2026-10-11", time: "18:00:00" }),
  workout({ id: "eliminato", date: "2026-10-06", status: "done", duration_min: 30, deleted_at: "2026-10-06T10:00:00Z" }),
  workout({ id: "settimana prima", date: "2026-10-04", status: "done", duration_min: 20 }),
];

describe("shownStatus", () => {
  it("un allenamento pianificato in un giorno passato vale come saltato", () => {
    expect(shownStatus({ status: "planned", date: "2026-10-08" }, TODAY)).toBe("skipped");
  });
  it("quello di oggi o dei prossimi giorni resta in programma", () => {
    expect(shownStatus({ status: "planned", date: TODAY }, TODAY)).toBe("planned");
    expect(shownStatus({ status: "planned", date: "2026-10-11" }, TODAY)).toBe("planned");
  });
  it("uno fatto resta fatto anche se è passato", () => {
    expect(shownStatus({ status: "done", date: "2026-10-05" }, TODAY)).toBe("done");
  });
});

describe("workoutsOfDay", () => {
  it("mette prima quelli con orario, poi gli altri nell'ordine in cui sono nati", () => {
    const day = [
      workout({ id: "senza ora", date: TODAY, created_at: "2026-10-09T08:00:00Z" }),
      workout({ id: "sera", date: TODAY, time: "19:00:00" }),
      workout({ id: "mattina", date: TODAY, time: "07:30:00" }),
      workout({ id: "altro giorno", date: "2026-10-11" }),
      workout({ id: "tolto", date: TODAY, deleted_at: "2026-10-10T09:00:00Z" }),
    ];
    expect(workoutsOfDay(day, TODAY).map((w) => w.id)).toEqual(["mattina", "sera", "senza ora"]);
  });
});

describe("summarize", () => {
  it("conta le sessioni della settimana, quelle fatte e i loro minuti", () => {
    expect(summarize(week, "2026-10-05", "2026-10-11")).toEqual({ done: 2, total: 4, minutes: 105 });
  });
  it("una settimana senza allenamenti è vuota", () => {
    expect(summarize(week, "2026-10-12", "2026-10-18")).toEqual({ done: 0, total: 0, minutes: 0 });
  });
  it("scrive il riepilogo, con i minuti solo se ce ne sono", () => {
    expect(summaryLabel({ done: 2, total: 4, minutes: 105 })).toBe("2 di 4 · 1 h 45");
    expect(summaryLabel({ done: 0, total: 1, minutes: 0 })).toBe("0 di 1");
  });
});

describe("groupByWeek", () => {
  it("raggruppa per settimana dalla più recente, con i giorni più recenti in cima", () => {
    const weeks = groupByWeek(week);
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ["2026-10-05", "2026-10-11"],
      ["2026-09-28", "2026-10-04"],
    ]);
    expect(weeks[0].workouts.map((w) => w.id)).toEqual(["nuoto", "pilates", "forza", "corsa"]);
    expect(weeks[0].summary).toEqual({ done: 2, total: 4, minutes: 105 });
    expect(weeks[1].summary).toEqual({ done: 1, total: 1, minutes: 20 });
  });
});

describe("activitySuggestions", () => {
  it("propone prima le discipline usate, dalla più frequente, poi le predefinite senza doppioni", () => {
    const used = [
      workout({ id: "1", date: TODAY, activity: "Pilates" }),
      workout({ id: "2", date: TODAY, activity: "corsa" }),
      workout({ id: "3", date: TODAY, activity: "Corsa" }),
      workout({ id: "4", date: TODAY, activity: "Arrampicata" }),
    ];
    const suggestions = activitySuggestions(used);
    expect(suggestions.slice(0, 3)).toEqual(["corsa", "Arrampicata", "Pilates"]);
    expect(suggestions.filter((s) => s.toLowerCase() === "corsa")).toHaveLength(1);
    expect(suggestions).toHaveLength(DEFAULT_ACTIVITIES.length + 1);
  });
  it("non impara dai nomi che arrivano da Salute né dagli allenamenti eliminati", () => {
    const used = [
      workout({ id: "1", date: TODAY, activity: "Yoga", source: "health" }),
      workout({ id: "2", date: TODAY, activity: "Boxe", deleted_at: "2026-10-10T09:00:00Z" }),
    ];
    expect(activitySuggestions(used)).toEqual(DEFAULT_ACTIVITIES);
  });
});

describe("distanza", () => {
  it("mostra metri sotto il chilometro e chilometri con una cifra decimale", () => {
    expect(formatDistance(800)).toBe("800 m");
    expect(formatDistance(5000)).toBe("5 km");
    expect(formatDistance(5240)).toBe("5,2 km");
  });
  it("legge i chilometri con la virgola o con il punto", () => {
    expect(parseKm("5,2")).toBe(5200);
    expect(parseKm("10.5")).toBe(10500);
    expect(parseKm("")).toBeNull();
    expect(parseKm("abc")).toBeNull();
    expect(parseKm("0")).toBeNull();
  });
});
