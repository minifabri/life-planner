"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, weekStart, type LocalDate } from "../dates/local";
import { mealMemoryQuery, mealsQuery } from "./meals";

export function useMeals(from: LocalDate) {
  return useQuery(mealsQuery(from));
}

/** I pasti da oggi alla fine della settimana prossima: quelli per cui servono gli ingredienti in casa. */
export function useUpcomingMeals(today: LocalDate) {
  const from = weekStart(today);
  const thisWeek = useMeals(from).data;
  const nextWeek = useMeals(addDays(from, 7)).data;
  return [...(thisWeek ?? []), ...(nextWeek ?? [])].filter((m) => m.date >= today);
}

export function useMealMemory() {
  return useQuery(mealMemoryQuery);
}

/** Tiene in cache la settimana corrente e i ricorrenti, così il planner funziona senza rete (technical-design.md, 6.2). */
export function usePrefetchMeals(today: LocalDate) {
  const qc = useQueryClient();
  useEffect(() => {
    void qc.prefetchQuery(mealsQuery(weekStart(today)));
    void qc.prefetchQuery(mealMemoryQuery);
  }, [today, qc]);
}
