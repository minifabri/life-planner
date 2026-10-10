"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EditorTarget } from "@/components/today/item-editor";
import { buildDay, type DayView } from "@/lib/calendar/view";
import { updateEvent } from "@/lib/data/api";
import { useAreas, useOffline, useRangeEvents, useRangeTasks, useTaskActions, useTimezone, useToday } from "@/lib/data/hooks";
import { useWorkoutActions, useWorkouts } from "@/lib/data/workouts-hooks";
import type { LocalDate } from "@/lib/dates/local";
import { openDayNext } from "@/lib/nav/day-handoff";
import type { Area, Workout } from "@/lib/supabase/types";

/** Dati e azioni comuni a Settimana e Mese per i giorni indicati (consecutivi). */
export function useCalendar(days: LocalDate[]) {
  const tz = useTimezone();
  const { today, now } = useToday(tz);
  const router = useRouter();
  const offline = useOffline();
  const from = days[0];
  const to = days[days.length - 1];

  const tasksQuery = useRangeTasks(from, to, tz);
  const eventsQuery = useRangeEvents(from, to, tz);
  // Gli allenamenti non bloccano la vista: se mancano, il calendario si mostra comunque.
  const workouts = useWorkouts(from, to).data;
  const areas = useAreas().data;
  const actions = useTaskActions(today, tz);
  const workoutActions = useWorkoutActions();
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);

  const tasks = tasksQuery.data;
  const events = eventsQuery.data;
  const views = useMemo<DayView[]>(
    () => (tasks && events ? days.map((day) => buildDay(tasks, events.events, events.exceptions, day, today, tz, workouts)) : []),
    // `days` è ricalcolato a ogni render: l'intervallo è identificato dai suoi estremi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, events, workouts, from, to, today, tz],
  );
  const areaById = useMemo(() => new Map<string, Area>((areas ?? []).map((a) => [a.id, a])), [areas]);

  const missing = tasks === undefined || events === undefined;
  const failed = missing && (offline || tasksQuery.isError || eventsQuery.isError);

  return {
    tz,
    today,
    now,
    offline,
    tasks: tasks ?? [],
    views,
    areaById,
    actions,
    workoutActions,
    editor,
    setEditor,
    /** Allenamento aperto nel foglio di modifica. */
    workout,
    setWorkout,
    missing,
    failed,
    retry: () => {
      tasksQuery.refetch();
      eventsQuery.refetch();
    },
    /** Apre la vista Giorno sul giorno indicato. */
    openDay: (day: LocalDate) => {
      openDayNext(day);
      router.push("/today");
    },
    moveEvent: updateEvent,
  };
}
