"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { addDays, endOfWeek, weekStart, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import { mergeById } from "../private/items";
import { getSyncState, subscribeSyncState, type SyncState } from "../sync/engine";
import type { DayEvents } from "../sync/ops";
import { dismissPatch, movePatch, type TaskPatch } from "../tasks/actions";
import { requestLaundryDone } from "../nav/laundry-handoff";
import { laundryGroupOfTask } from "../wardrobe/laundry";
import type { Task } from "../supabase/types";
import {
  completeTask,
  fetchAreas,
  fetchEvents,
  fetchLogCategories,
  fetchProfile,
  fetchRecurrences,
  fetchTasks,
  removeTask,
  restoreTask,
  reopenTask,
  updateTask,
} from "./api";
import { useLogUnlocked } from "./log-hooks";
import { PRIVATE_ITEMS_KEY, fetchPrivateEvents, fetchPrivateTasks, forgetPrivateItems } from "./private";
import { fetchTemplates } from "./templates";
import { workoutsQuery } from "./workouts-hooks";

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

/** Profilo (nome, ora della Evening review): dalla stessa cache del fuso. */
export function useProfile() {
  // Non `Infinity`: un profilo salvato sul dispositivo da una versione precedente va riletto, o gli mancano i campi nuovi.
  return useQuery({ queryKey: ["profile"], queryFn: fetchProfile, staleTime: 5 * 60_000 }).data ?? null;
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

/**
 * Attività ed eventi riservati dei giorni da `from` a `to` (D68): segnaposto a Log bloccato, righe intere
 * a Log sbloccato. Mai salvati sul dispositivo; il contenuto esce dalla memoria appena il Log si blocca.
 * Senza rete mancano e basta: le viste mostrano il resto.
 */
function usePrivateItems<T>(kind: "tasks" | "events", from: LocalDate, to: LocalDate, tz: string, fetch: (full: boolean) => Promise<T>) {
  const unlocked = useLogUnlocked();
  useEffect(() => {
    if (!unlocked) forgetPrivateItems();
  }, [unlocked]);
  return useQuery({
    queryKey: [PRIVATE_ITEMS_KEY, kind, from, to, unlocked ? "full" : "stub"],
    queryFn: () => fetch(unlocked),
    gcTime: unlocked ? 0 : 5 * 60_000,
    retry: false,
  }).data;
}

/** Le attività di una vista con, in più, le riservate. */
function useWithPrivateTasks(query: UseQueryResult<Task[]>, from: LocalDate, to: LocalDate, tz: string): UseQueryResult<Task[]> {
  const extra = usePrivateItems("tasks", from, to, tz, (full) => fetchPrivateTasks(from, tz, to, full));
  const data = useMemo(() => (query.data && extra ? mergeById(query.data, extra) : query.data), [query.data, extra]);
  return { ...query, data } as UseQueryResult<Task[]>;
}

/** Gli eventi di una vista con, in più, i riservati. */
function useWithPrivateEvents(query: UseQueryResult<DayEvents>, from: LocalDate, to: LocalDate, tz: string): UseQueryResult<DayEvents> {
  const extra = usePrivateItems("events", from, to, tz, (full) => fetchPrivateEvents(from, tz, to, full));
  const data = useMemo(
    () =>
      query.data && extra
        ? { events: mergeById(query.data.events, extra.events), exceptions: mergeById(query.data.exceptions, extra.exceptions) }
        : query.data,
    [query.data, extra],
  );
  return { ...query, data } as UseQueryResult<DayEvents>;
}

export function useTasks(day: LocalDate, tz: string) {
  return useWithPrivateTasks(useQuery(tasksQuery(day, tz)), day, day, tz);
}

export function useEvents(day: LocalDate, tz: string) {
  return useWithPrivateEvents(useQuery(eventsQuery(day, tz)), day, day, tz);
}

/** Attività di un intervallo di giorni (settimana, mese). */
export function useRangeTasks(from: LocalDate, to: LocalDate, tz: string) {
  return useWithPrivateTasks(useQuery({ queryKey: ["tasks", from, to], queryFn: () => fetchTasks(from, tz, to) }), from, to, tz);
}

/** Eventi di un intervallo di giorni (settimana, mese). */
export function useRangeEvents(from: LocalDate, to: LocalDate, tz: string) {
  return useWithPrivateEvents(useQuery({ queryKey: ["events", from, to], queryFn: () => fetchEvents(from, tz, to) }), from, to, tz);
}

/** Tiene in cache ieri, oggi e domani, anche se l'app è stata aperta su un'altra schermata (technical-design.md, 6.2). */
export function usePrefetchAround(today: LocalDate, tz: string) {
  const qc = useQueryClient();
  useEffect(() => {
    for (const day of [addDays(today, -1), today, addDays(today, 1)]) {
      void qc.prefetchQuery(tasksQuery(day, tz));
      void qc.prefetchQuery(eventsQuery(day, tz));
      void qc.prefetchQuery(workoutsQuery(weekStart(day), endOfWeek(day)));
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
    if (!ok) return;
    toast({ message: "Completata", actionLabel: "Annulla", onAction: () => reopen(task) });
    // Una lavatrice completata chiede quali capi tornano puliti (D69). Una riservata no: il titolo non si vede.
    const group = task.is_private ? undefined : laundryGroupOfTask(task);
    if (group !== undefined) requestLaundryDone({ group, taskId: task.id });
  }

  return {
    complete,
    reopen,
    toggle: (task: Task) => (task.status === "done" ? reopen(task) : complete(task)),
    moveTo: (task: Task, date: LocalDate) => patch(task, movePatch(task, date)),
    moveToToday: (task: Task) => patch(task, movePatch(task, today)),
    dismiss: (task: Task) => patch(task, dismissPatch()),
    remove: async (task: Task) => {
      const ok = await apply(() => removeTask(task));
      if (ok) toast({ message: "Attività eliminata", actionLabel: "Annulla", onAction: () => apply(() => restoreTask(task)) });
      return ok;
    },
  };
}

export function useInvalidateDay() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: [PRIVATE_ITEMS_KEY] });
    qc.invalidateQueries({ queryKey: ["workouts"] });
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

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: fetchTemplates, staleTime: 5 * 60_000 });
}
