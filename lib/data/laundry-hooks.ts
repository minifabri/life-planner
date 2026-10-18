"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LocalDate } from "../dates/local";
import type { Task, WashGroup } from "../supabase/types";
import { WASH_GROUPS, dryingNote, isSnoozed, laundryOverview, plannedLaundry, type LaundryProposal } from "../wardrobe/laundry";
import { LAUNDRY_TASKS_KEY, LOADS_KEY, fetchLaundryTasks, fetchLoads } from "./laundry";
import { useOutfitPlans, useOutfits, useWardrobeItems } from "./wardrobe-hooks";
import { useForecast } from "./weather";

export function useLaundryLoads() {
  return useQuery({ queryKey: LOADS_KEY, queryFn: fetchLoads });
}

export function useLaundryTasks() {
  return useQuery({ queryKey: LAUNDRY_TASKS_KEY, queryFn: fetchLaundryTasks });
}

/**
 * "Non ora" per gruppo: quanti capi aveva quando è stato messo da parte. Una comodità del dispositivo:
 * se si perde, la proposta torna e basta.
 */
const SNOOZE_KEY = "planner-laundry-snoozed";
type Snoozed = Partial<Record<WashGroup, number>>;
const snoozeListeners = new Set<() => void>();
let snoozeCache: { raw: string | null; value: Snoozed } = { raw: null, value: {} };

function readSnoozed(): Snoozed {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SNOOZE_KEY);
  } catch {
    // Archivio non disponibile (navigazione privata): nessuna proposta messa da parte.
  }
  if (raw !== snoozeCache.raw) {
    let value: Snoozed = {};
    try {
      value = raw ? (JSON.parse(raw) as Snoozed) : {};
    } catch {
      value = {};
    }
    snoozeCache = { raw, value };
  }
  return snoozeCache.value;
}

function writeSnoozed(next: Snoozed) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
  } catch {
    // Non salvato: la proposta tornerà alla prossima apertura.
  }
  snoozeCache = { raw: null, value: next };
  for (const l of snoozeListeners) l();
}

function subscribeSnoozed(listener: () => void) {
  snoozeListeners.add(listener);
  return () => snoozeListeners.delete(listener);
}

const NO_SNOOZE: Snoozed = {};

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
  const snoozed = useSyncExternalStore(subscribeSnoozed, readSnoozed, () => NO_SNOOZE);

  const overview = useMemo(
    () => (items ? laundryOverview({ items, plans: plans ?? [], outfits: outfits ?? [], loads: loads ?? [], today }) : null),
    [items, plans, outfits, loads, today],
  );

  const proposals: LaundryGroupState[] = useMemo(
    () => (overview?.proposals ?? []).filter((p) => !isSnoozed(p, snoozed)).map((p) => ({ ...p, planned: plannedLaundry(tasks ?? [], p.group) })),
    [overview, snoozed, tasks],
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

  const snooze = useCallback((p: LaundryProposal) => writeSnoozed({ ...readSnoozed(), [p.group]: p.items.length }), []);
  const unsnooze = useCallback((group: WashGroup) => {
    const next = { ...readSnoozed() };
    delete next[group];
    writeSnoozed(next);
  }, []);

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
