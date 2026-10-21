"use client";

import { useState } from "react";
import { CalendarError, CalendarHeader } from "@/components/calendar/calendar-header";
import { DayAgenda } from "@/components/calendar/day-agenda";
import { useCalendar } from "@/components/calendar/use-calendar";
import { ItemEditor } from "@/components/today/item-editor";
import { Icon } from "@/components/ui/icon";
import { WorkoutSheet } from "@/components/workouts/workout-sheet";
import { isEmptyDay, LIST_DAYS } from "@/lib/calendar/filter";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { addDays, relativeDay, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";

/** Lista (D75): i giorni da oggi in poi uno sotto l'altro, solo quelli con qualcosa, secondo i filtri. */
export default function ListPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  // Finché non si sceglie un periodo si parte da oggi.
  const [anchor, setAnchor] = useState<LocalDate | null>(null);
  const from = anchor ?? today;
  const days = Array.from({ length: LIST_DAYS }, (_, i) => addDays(from, i));
  const to = days[days.length - 1];
  const cal = useCalendar(days);
  const { views, areaById, actions } = cal;
  const shown = views.filter((v) => !isEmptyDay(v));

  return (
    <>
      <CalendarHeader
        eyebrow="Calendario · Lista"
        title={`${shortDate(from)} – ${shortDate(to)}`}
        muted={to.slice(0, 4) !== today.slice(0, 4) ? to.slice(0, 4) : undefined}
        prevLabel={`${LIST_DAYS} giorni prima`}
        nextLabel={`${LIST_DAYS} giorni dopo`}
        showToday={from !== today}
        onPrev={() => setAnchor(addDays(from, -LIST_DAYS))}
        onNext={() => setAnchor(addDays(from, LIST_DAYS))}
        onToday={() => setAnchor(null)}
      />

      {cal.failed ? (
        <CalendarError offline={cal.offline} onRetry={cal.retry} />
      ) : cal.missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico i prossimi giorni…
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-3">{cal.filters.size ? "Niente per i filtri scelti in questi giorni." : "Niente in programma in questi giorni."}</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((view) => {
            const isToday = view.day === today;
            const near = relativeDay(view.day, today);
            return (
              <li key={view.day} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
                <h2 className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => cal.openDay(view.day)}
                    aria-label={`Apri ${weekdayName(view.day)} ${shortDate(view.day)}`}
                    className={`-ml-2.5 flex min-h-11 items-baseline gap-2 rounded-lg px-2.5 text-left hover:bg-surface-2 ${isToday ? "text-accent" : "text-text"}`}
                  >
                    <span className="text-[15px] font-medium first-letter:uppercase">{weekdayName(view.day)}</span>
                    <span className="font-mono text-[11.5px] text-text-3">
                      {shortDate(view.day)}
                      {near !== shortDate(view.day) && near !== weekdayName(view.day) ? ` · ${near}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cal.setEditor({ kind: "new", day: view.day })}
                    aria-label={`Aggiungi a ${weekdayName(view.day)} ${shortDate(view.day)}`}
                    className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </h2>
                <DayAgenda
                  view={view}
                  today={today}
                  areaById={areaById}
                  onEdit={cal.setEditor}
                  onToggleTask={actions.toggle}
                  onToggleWorkout={cal.workoutActions.toggle}
                  onOpenWorkout={cal.setWorkout}
                />
              </li>
            );
          })}
        </ol>
      )}

      {cal.editor ? (
        <ItemEditor
          key={cal.editor.kind === "task" ? cal.editor.task.id : cal.editor.kind === "event" ? cal.editor.occurrence.key : `new-${cal.editor.day}`}
          target={cal.editor}
          today={today}
          tz={tz}
          onClose={() => cal.setEditor(null)}
          onDeleteTask={actions.remove}
        />
      ) : null}
      {cal.workout ? (
        <WorkoutSheet key={cal.workout.id} target={{ kind: "edit", workout: cal.workout }} today={today} onClose={() => cal.setWorkout(null)} />
      ) : null}
    </>
  );
}
