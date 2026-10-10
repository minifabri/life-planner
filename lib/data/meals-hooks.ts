"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { weekStart, type LocalDate } from "../dates/local";
import { mealMemoryQuery, mealsQuery } from "./meals";

export function useMeals(from: LocalDate) {
  return useQuery(mealsQuery(from));
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
