import { describe, expect, it } from "vitest";
import type { DayMark, Workout } from "../supabase/types";
import { applyToDayMarks, applyToWorkouts } from "../sync/ops";
import { daySigns, dayWorkouts, signsText, toggleMarkOp, workoutLabel } from "./marks";

const TODAY = "2026-10-12";
const AT = "2026-10-12T08:00:00.000Z";

function workout(over: Partial<Workout> & { id: string }): Workout {
  return applyToWorkouts([], { kind: "insert", table: "workouts", row: { activity: "Corsa", date: TODAY, ...over } }, AT, "2026-10-01", "2026-10-31")[0];
}

const marks: DayMark[] = [
  { id: "t", date: "2026-10-13", kind: "travel" },
  { id: "o", date: "2026-10-13", kind: "office" },
  { id: "o2", date: "2026-10-14", kind: "office" },
];

describe("daySigns", () => {
  it("mostra i segni del giorno sempre nello stesso ordine", () => {
    expect(daySigns("2026-10-13", marks, [], TODAY)).toEqual(["office", "travel"]);
    expect(daySigns("2026-10-14", marks, [], TODAY)).toEqual(["office"]);
    expect(daySigns("2026-10-15", marks, [], TODAY)).toEqual([]);
  });

  it("aggiunge l'allenamento quando il giorno ne ha uno", () => {
    const workouts = [workout({ id: "w", date: "2026-10-14" })];
    expect(daySigns("2026-10-14", marks, workouts, TODAY)).toEqual(["office", "workout"]);
    expect(daySigns("2026-10-13", marks, workouts, TODAY)).toEqual(["office", "travel"]);
  });

  it("non conta gli allenamenti saltati o eliminati", () => {
    const workouts = [
      workout({ id: "a", date: "2026-10-10" }),
      workout({ id: "b", date: "2026-10-11", status: "skipped" }),
      workout({ id: "c", date: "2026-10-09", status: "done" }),
    ];
    expect(daySigns("2026-10-10", [], workouts, TODAY)).toEqual([]);
    expect(daySigns("2026-10-11", [], workouts, TODAY)).toEqual([]);
    expect(daySigns("2026-10-09", [], workouts, TODAY)).toEqual(["workout"]);
    expect(dayWorkouts([{ ...workout({ id: "d" }), deleted_at: AT }], TODAY, TODAY)).toEqual([]);
  });
});

describe("testi", () => {
  it("descrive i segni a parole", () => {
    expect(signsText(["office", "workout"])).toBe("ufficio, allenamento");
    expect(signsText([])).toBe("");
  });

  it("scrive l'allenamento con l'orario, se c'è", () => {
    expect(workoutLabel({ activity: "Corsa", time: "18:00:00" })).toBe("Corsa 18:00");
    expect(workoutLabel({ activity: "Forza", time: null })).toBe("Forza");
  });
});

describe("toggleMarkOp", () => {
  it("mette il segno che manca e toglie quello che c'è", () => {
    const add = toggleMarkOp(marks, "n", "2026-10-15", "travel");
    expect(add).toEqual({ kind: "insert", table: "day_marks", row: { id: "n", date: "2026-10-15", kind: "travel" } });
    const remove = toggleMarkOp(marks, "n", "2026-10-13", "travel");
    expect(remove).toEqual({ kind: "delete", table: "day_marks", where: [["id", "eq", "t"]] });
  });

  it("si vede subito nei giorni in cache, solo se il giorno è tra quelli", () => {
    const week = (list: DayMark[], date: string) => applyToDayMarks(list, toggleMarkOp(list, "n", date, "travel"), "2026-10-12", "2026-10-18");
    expect(week(marks, "2026-10-15").map((m) => m.id)).toEqual(["t", "o", "o2", "n"]);
    expect(week(marks, "2026-10-13").map((m) => m.id)).toEqual(["o", "o2"]);
    expect(week(marks, "2026-10-20")).toEqual(marks);
  });

  it("rifare lo stesso inserimento non duplica il segno", () => {
    const op = toggleMarkOp([], "n", "2026-10-15", "office");
    const once = applyToDayMarks([], op, "2026-10-12", "2026-10-18");
    expect(applyToDayMarks(once, op, "2026-10-12", "2026-10-18")).toEqual(once);
  });
});
