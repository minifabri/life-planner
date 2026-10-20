"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfWeek, weekStart, type LocalDate } from "../dates/local";
import { TRAVEL_LOOK_AROUND, travelAnswerKey, travelDays, withTravelDays } from "../days/travel";
import type { DayMark } from "../supabase/types";
import { fetchEvents } from "./api";
import { fetchDayMarks } from "./day-marks";
import { useTimezone } from "./hooks";
import { useAnswerMap } from "./questions-hooks";
import { useWorkouts } from "./workouts-hooks";

/**
 * Segni di un intervallo di giorni: quelli messi a mano e i giorni in viaggio che dice il calendario (D72).
 * Per trovare andata e ritorno, o check-in e check-out, si leggono anche gli eventi intorno al periodo.
 * Finché gli eventi o le risposte non ci sono, si mostrano i soli segni a mano.
 */
export function useDayMarks(from: LocalDate, to: LocalDate): { data: DayMark[] | undefined } {
  const tz = useTimezone();
  const saved = useQuery({ queryKey: ["day-marks", from, to], queryFn: () => fetchDayMarks(from, to) }).data;
  const aroundFrom = addDays(from, -TRAVEL_LOOK_AROUND);
  const aroundTo = addDays(to, TRAVEL_LOOK_AROUND);
  const around = useQuery({ queryKey: ["events", aroundFrom, aroundTo], queryFn: () => fetchEvents(aroundFrom, tz, aroundTo) }).data;
  const answers = useAnswerMap();
  const data = useMemo(() => {
    if (!saved || !around || !answers) return saved;
    const travel = travelDays(around.events, around.exceptions, from, to, tz);
    return withTravelDays(saved, travel, (day) => answers.get(travelAnswerKey(day))?.answer === "no");
  }, [saved, around, answers, from, to, tz]);
  return { data };
}

/** La settimana (da lunedì a domenica) che contiene `day`: la stessa chiave per Oggi, Settimana e Pasti. */
export function useWeekDayMarks(day: LocalDate) {
  return useDayMarks(weekStart(day), endOfWeek(day));
}

/** Segni e allenamenti di un intervallo: ciò che serve per capire com'è fatto un giorno. Se mancano, la vista si mostra comunque. */
export function useDayContext(from: LocalDate, to: LocalDate) {
  return { marks: useDayMarks(from, to).data ?? [], workouts: useWorkouts(from, to).data ?? [] };
}
