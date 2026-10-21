"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalDate } from "../dates/local";
import { MEDICINES_KEY, dosesFrom, dosesKey, fetchDoses, fetchMedicines } from "./medicines";

export function useMedicines() {
  return useQuery({ queryKey: MEDICINES_KEY, queryFn: fetchMedicines });
}

/** Le risposte degli ultimi giorni, fino a oggi. */
export function useMedicineDoses(today: LocalDate) {
  const from = dosesFrom(today);
  return useQuery({ queryKey: dosesKey(from), queryFn: () => fetchDoses(from) });
}
