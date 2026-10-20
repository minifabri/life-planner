"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LocalDate } from "../dates/local";
import type { Task, WashGroup } from "../supabase/types";
import { WASH_GROUPS, dryingNote, isSnoozed, laundryOverview, plannedLaundry, type LaundryProposal } from "../wardrobe/laundry";
import { LAUNDRY_TASKS_KEY, LOADS_KEY, fetchLaundryTasks, fetchLoads } from "./laundry";
import { forgetAnswer, importDevice, saveAnswer } from "./questions";
import { useAnswerMap, useImportOnce } from "./questions-hooks";
import { useOutfitPlans, useOutfits, useWardrobeItems } from "./wardrobe-hooks";
import { useForecast } from "./weather";

export function useLaundryLoads() {
  return useQuery({ queryKey: LOADS_KEY, queryFn: fetchLoads });
}

export function useLaundryTasks() {
  return useQuery({ queryKey: LAUNDRY_TASKS_KEY, queryFn: fetchLaundryTasks });
}

/**
 * "Non ora" per gruppo: quanti capi aveva quando è stato messo da parte. Sta sul server tra le risposte,
 * così vale su tutti i dispositivi.
 */
const snoozeKey = (group: WashGroup) => `laundry-snooze:${group}`;
/** Dove le versioni precedenti salvavano i "Non ora" sul dispositivo. */
const DEVICE_SNOOZE_KEY = "planner-laundry-snoozed";

function deviceSnoozes(value: unknown): { key: string; answer: string }[] {
  if (!value || typeof value !== "object") return [];
  return WASH_GROUPS.flatMap((g) => {
    const n = (value as Record<string, unknown>)[g];
    return typeof n === "number" && Number.isFinite(n) ? [{ key: snoozeKey(g), answer: String(n) }] : [];
  });
}

export type LaundryGroupState = LaundryProposal & {
  /** La prossima lavatrice in programma per il gruppo, se c'è. */
  planned: Task | null;
};

/** Tutto ciò che serve a mostrare le lavatrici: conteggi, proposte, lavatrici in programma, nota sul meteo. */
export function useLaundry(today: LocalDate) {
  const items = useWardrobeItems().data;
  const plans = useOutfitPlans().data;
  const outfits = useOutfits().data;
  const loads = useLaundryLoads().data;
  const tasks = useLaundryTasks().data;
  const weather = useForecast();
  const answers = useAnswerMap();
  useImportOnce(() => importDevice(DEVICE_SNOOZE_KEY, deviceSnoozes));
  const snoozed = useMemo(() => {
    const out: Partial<Record<WashGroup, number>> = {};
    for (const g of WASH_GROUPS) {
      const answer = answers?.get(snoozeKey(g));
      if (answer && Number.isFinite(Number(answer.answer))) out[g] = Number(answer.answer);
    }
    return out;
  }, [answers]);

  const overview = useMemo(
    () => (items ? laundryOverview({ items, plans: plans ?? [], outfits: outfits ?? [], loads: loads ?? [], today }) : null),
    [items, plans, outfits, loads, today],
  );

  const proposals: LaundryGroupState[] = useMemo(
    // Finché i "Non ora" non si sanno, nessuna proposta: meglio che vederla sparire.
    () => (answers ? (overview?.proposals ?? []) : []).filter((p) => !isSnoozed(p, snoozed)).map((p) => ({ ...p, planned: plannedLaundry(tasks ?? [], p.group) })),
    [answers, overview, snoozed, tasks],
  );

  const planned = useMemo(() => Object.fromEntries(WASH_GROUPS.map((g) => [g, plannedLaundry(tasks ?? [], g)])) as Record<WashGroup, Task | null>, [tasks]);

  /**
   * La lavatrice di un gruppo scelta a mano, anche senza una proposta (o con la proposta messa da parte):
   * la proposta se c'è, altrimenti i capi da lavare del gruppo senza un perché.
   */
  const groupState = useCallback(
    (group: WashGroup): LaundryGroupState | null => {
      const proposal = (overview?.proposals ?? []).find((p) => p.group === group);
      if (proposal) return { ...proposal, planned: plannedLaundry(tasks ?? [], group) };
      const entry = overview?.counts.find((c) => c.group === group);
      if (!entry) return null;
      return { group, items: entry.items, reasons: [], deadline: null, urgent: false, planned: plannedLaundry(tasks ?? [], group) };
    },
    [overview, tasks],
  );

  // Se non si salva, la proposta torna e basta.
  const snooze = useCallback((p: LaundryProposal) => void saveAnswer(snoozeKey(p.group), String(p.items.length), true).catch(() => {}), []);
  const unsnooze = useCallback((group: WashGroup) => void forgetAnswer(snoozeKey(group)).catch(() => {}), []);

  return {
    ready: !!overview,
    counts: overview?.counts ?? [],
    ungrouped: overview?.ungrouped ?? [],
    proposals,
    planned,
    groupState,
    drying: dryingNote(weather.days, today),
    weather,
    snooze,
    unsnooze,
  };
}
