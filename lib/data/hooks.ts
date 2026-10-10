"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import type { LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import { completePatch, dismissPatch, movePatch, reopenPatch, type TaskPatch } from "../tasks/actions";
import type { Task } from "../supabase/types";
import {
  createNextAfterCompletion,
  fetchAreas,
  fetchEvents,
  fetchLogCategories,
  fetchProfile,
  fetchTasks,
  materializeRecurrences,
  removeNextAfterCompletion,
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

export function useTasks(day: LocalDate, tz: string) {
  return useQuery({ queryKey: ["tasks", day], queryFn: () => fetchTasks(day, tz) });
}

export function useEvents(day: LocalDate, tz: string) {
  return useQuery({ queryKey: ["events", day], queryFn: () => fetchEvents(day, tz) });
}

/** Una volta al giorno (e a ogni apertura) crea le prossime attività ricorrenti. */
export function useRecurrenceMaintenance(today: LocalDate) {
  const qc = useQueryClient();
  useEffect(() => {
    let active = true;
    materializeRecurrences(today)
      .then((created) => {
        if (active && created > 0) qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .catch(() => {
        // Senza rete si riprova alla prossima apertura: le attività già create restano visibili.
      });
    return () => {
      active = false;
    };
  }, [today, qc]);
}

/** Azioni sulle attività con aggiornamento immediato dell'interfaccia. */
export function useTaskActions(today: LocalDate, tz: string) {
  const qc = useQueryClient();
  const toast = useToast();

  async function apply(task: Task, patch: TaskPatch, after?: () => Promise<void>) {
    await qc.cancelQueries({ queryKey: ["tasks"] });
    qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
      old?.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
    );
    try {
      await updateTask(task.id, patch);
      await after?.();
      return true;
    } catch {
      toast({ message: "Modifica non salvata. Controlla la connessione e riprova.", tone: "warn" });
      return false;
    } finally {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  }

  function reopen(task: Task) {
    return apply(task, reopenPatch(), () => removeNextAfterCompletion(task));
  }

  async function complete(task: Task) {
    const now = new Date();
    const ok = await apply(task, completePatch(now), () => createNextAfterCompletion(task, now, tz));
    if (ok) toast({ message: "Completata", actionLabel: "Annulla", onAction: () => reopen(task) });
  }

  return {
    complete,
    reopen,
    toggle: (task: Task) => (task.status === "done" ? reopen(task) : complete(task)),
    moveTo: (task: Task, date: LocalDate) => apply(task, movePatch(task, date)),
    moveToToday: (task: Task) => apply(task, movePatch(task, today)),
    dismiss: (task: Task) => apply(task, dismissPatch()),
    remove: (task: Task) => apply(task, { deleted_at: new Date().toISOString() }),
  };
}

export function useInvalidateDay() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["events"] });
  };
}
