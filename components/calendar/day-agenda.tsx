"use client";

import type { EditorTarget } from "@/components/today/item-editor";
import { EventBlock } from "@/components/today/event-block";
import { QuietEvents } from "@/components/today/quiet-events";
import { TaskRow } from "@/components/today/task-row";
import { WorkoutRow } from "@/components/workouts/workout-row";
import type { DayView } from "@/lib/calendar/view";
import { dueLabel, type LocalDate } from "@/lib/dates/local";
import type { Area, Task, Workout } from "@/lib/supabase/types";

/** Le voci di un giorno, come nell'anteprima del Mese e nella Lista: spedizioni e compleanni, eventi, attività, allenamenti. */
export function DayAgenda({
  view,
  today,
  areaById,
  onEdit,
  onToggleTask,
  onToggleWorkout,
  onOpenWorkout,
}: {
  view: DayView;
  today: LocalDate;
  areaById: Map<string, Area>;
  onEdit: (target: EditorTarget) => void;
  onToggleTask: (task: Task) => void;
  onToggleWorkout: (workout: Workout) => void;
  onOpenWorkout: (workout: Workout) => void;
}) {
  const rows = [...view.timed, ...view.untimed];
  return (
    <>
      <QuietEvents occurrences={view.quiet} onOpen={(occurrence) => onEdit({ kind: "event", occurrence })} className="-mt-1.5" />
      {view.occurrences.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {view.occurrences.map((o) => (
            <EventBlock key={o.key} occurrence={o} area={areaById.get(o.event.area_id ?? "")} onOpen={() => onEdit({ kind: "event", occurrence: o })} />
          ))}
        </ul>
      ) : null}
      {rows.length + view.workouts.length > 0 ? (
        <ul className="flex flex-col">
          {rows.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              area={areaById.get(t.area_id ?? "")}
              showTime
              meta={t.due_date && t.status === "open" ? dueLabel(t.due_date, today) : undefined}
              onToggle={() => onToggleTask(t)}
              onOpen={() => onEdit({ kind: "task", task: t })}
            />
          ))}
          {view.workouts.map((w) => (
            <WorkoutRow key={w.id} workout={w} today={today} onToggle={() => onToggleWorkout(w)} onOpen={() => onOpenWorkout(w)} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
