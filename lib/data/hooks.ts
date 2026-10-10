"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { addDays, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import { getSyncState, subscribeSyncState, type SyncState } from "../sync/engine";
import { dismissPatch, movePatch, type TaskPatch } from "../tasks/actions";
import type { Task } from "../supabase/types";
import {
  completeTask,
  fetchAreas,
  fetchEvents,
  fetchLogCategories,
  fetchProfile,
  fetchRecurrences,
  fetchTasks,
  reopenTask,
  updateTask,
} from "./api";

/** L'istante corrente, aggiornato ogni mezzo minuto e al ritorno in primo piano. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/** Fuso del profilo: "oggi" e i confini del giorno si calcolano qui. */
export function useTimezone(): string {
  const { data } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile, staleTime: Infinity });
  return data?.timezone ?? DEFAULT_TZ;
}

export function useToday(tz: string): { today: LocalDate; now: Date } {
  const now = useNow();
  return { today: localDateString(now, tz), now };
}

export function useAreas() {
  return useQuery({ queryKey: ["areas"], queryFn: fetchAreas, staleTime: 5 * 60_000 });
}

export function useLogCategories() {
  return useQuery({ queryKey: ["log-categories"], queryFn: fetchLogCategories, staleTime: 5 * 60_000 });
}

function tasksQuery(day: LocalDate, tz: string) {
  return { queryKey: ["tasks", day], queryFn: () => fetchTasks(day, tz) };
}

function eventsQuery(day: LocalDate, tz: string) {
  return { queryKey: ["events", day], queryFn: () => fetchEvents(day, tz) };
}

export function useTasks(day: LocalDate, tz: string) {
  return useQuery(tasksQuery(day, tz));
}

export function useEvents(day: LocalDate, tz: string) {
  return useQuery(eventsQuery(day, tz));
}

/** Tiene in cache ieri e domani, così Today funziona senza rete su tre giorni (technical-design.md, 6.2). */
export function usePrefetchAround(today: LocalDate, tz: string) {
  const qc = useQueryClient();
  useEffect(() => {
    for (const day of [addDays(today, -1), addDays(today, 1)]) {
      void qc.prefetchQuery(tasksQuery(day, tz));
      void qc.prefetchQuery(eventsQuery(day, tz));
    }
  }, [today, tz, qc]);
}

export function useRecurrences() {
  return useQuery({ queryKey: ["recurrences"], queryFn: fetchRecurrences, staleTime: 5 * 60_000 });
}

/** Azioni sulle attività: l'interfaccia si aggiorna subito, l'invio al server segue appena c'è rete. */
export function useTaskActions(today: LocalDate, tz: string) {
  const toast = useToast();

  async function apply(write: () => Promise<void>) {
    try {
      await write();
      return true;
    } catch {
      // La outbox non è scrivibile (spazio esaurito, navigazione privata): la modifica non è stata registrata.
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
      return false;
    }
  }

  const patch = (task: Task, change: TaskPatch) => apply(() => updateTask(task, change));
  const reopen = (task: Task) => apply(() => reopenTask(task));

  async function complete(task: Task) {
    const ok = await apply(() => completeTask(task, new Date(), tz));
    if (ok) toast({ message: "Completata", actionLabel: "Annulla", onAction: () => reopen(task) });
  }

  return {
    complete,
    reopen,
    toggle: (task: Task) => (task.status === "done" ? reopen(task) : complete(task)),
    moveTo: (task: Task, date: LocalDate) => patch(task, movePatch(task, date)),
    moveToToday: (task: Task) => patch(task, movePatch(task, today)),
    dismiss: (task: Task) => patch(task, dismissPatch()),
    remove: (task: Task) => patch(task, { deleted_at: new Date().toISOString() }),
  };
}

export function useInvalidateDay() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["events"] });
  };
}

/** Modifiche in attesa di rete e stato dell'ultimo invio. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Vero quando il dispositivo dichiara di non avere rete. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
}
