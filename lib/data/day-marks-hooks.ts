"use client";

import { useQuery } from "@tanstack/react-query";
import { endOfWeek, weekStart, type LocalDate } from "../dates/local";
import { fetchDayMarks } from "./day-marks";
import { useWorkouts } from "./workouts-hooks";

/** Segni di un intervallo di giorni. */
export function useDayMarks(from: LocalDate, to: LocalDate) {
  return useQuery({ queryKey: ["day-marks", from, to], queryFn: () => fetchDayMarks(from, to) });
}

/** La settimana (da lunedì a domenica) che contiene `day`: la stessa chiave per Oggi, Settimana e Pasti. */
export function useWeekDayMarks(day: LocalDate) {
  return useDayMarks(weekStart(day), endOfWeek(day));
}

/** Segni e allenamenti di un intervallo: ciò che serve per capire com'è fatto un giorno. Se mancano, la vista si mostra comunque. */
export function useDayContext(from: LocalDate, to: LocalDate) {
  return { marks: useDayMarks(from, to).data ?? [], workouts: useWorkouts(from, to).data ?? [] };
}
