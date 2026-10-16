"use client";

import { useMemo } from "react";
import { isCycleCategory, predictCycle, type CyclePrediction } from "../cycle/predict";
import type { LocalDate } from "../dates/local";
import { useLogCategories } from "./hooks";
import { useLogUnlocked, useOpenEntries, usePrivateEntries } from "./log-hooks";

/**
 * Ciclo previsto e giorni fertili per i giorni da `from` a `to` (D68), dalle registrazioni delle categorie
 * di tipo Ciclo. Solo a Log sbloccato: a Log bloccato non si calcola nulla e non si mostra nulla.
 */
export function useCyclePrediction(today: LocalDate, from: LocalDate, to: LocalDate): CyclePrediction | null {
  const unlocked = useLogUnlocked();
  const categories = useLogCategories().data;
  const open = useOpenEntries().data;
  const reserved = usePrivateEntries().data;
  return useMemo(() => {
    if (!unlocked || !categories) return null;
    const ids = new Set(categories.filter((c) => isCycleCategory(c.name)).map((c) => c.id));
    if (!ids.size) return null;
    const dates = [...(open ?? []), ...(reserved ?? [])].filter((e) => e.category_id && ids.has(e.category_id)).map((e) => e.date);
    return predictCycle(dates, today, from, to);
  }, [unlocked, categories, open, reserved, today, from, to]);
}
