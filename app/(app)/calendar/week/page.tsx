"use client";

import { useState } from "react";
import { getISOWeek } from "date-fns";
import { CalendarError, CalendarHeader } from "@/components/calendar/calendar-header";
import { useCalendar } from "@/components/calendar/use-calendar";
import { TaskChip, WeekGrid, type Dragged } from "@/components/calendar/week-grid";
import { ItemEditor } from "@/components/today/item-editor";
import { Icon } from "@/components/ui/icon";
import { WorkoutMark } from "@/components/workouts/workout-row";
import { WorkoutSheet } from "@/components/workouts/workout-sheet";
import { canMoveEvent, dayHighlights, moveEventPatch, periodTasks, weekDays } from "@/lib/calendar/view";
import { addDays, dueLabel, formatDuration, localTimeString, shortDate, weekStart, weekdayName, type LocalDate } from "@/lib/dates/local";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { LOAD_LABEL } from "@/lib/tasks/load";

export default function WeekPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  // Finché non si sceglie una settimana si segue quella corrente.
  const [anchor, setAnchor] = useState<LocalDate | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const from = anchor ?? weekStart(today);
  const days = weekDays(from);
  const cal = useCalendar(days);
  const { views, areaById, actions } = cal;
  const thisWeek = weekStart(today);

  const period = periodTasks(cal.tasks, from, days[6], today);
  const week = getISOWeek(new Date(`${from}T12:00:00Z`));

  function dropOn(day: LocalDate) {
    const item = dragged;
    setDragged(null);
    if (!item) return;
    if ("task" in item) {
      if (item.task.date !== day) actions.moveTo(item.task, day);
    } else if ("workout" in item) {
      if (item.workout.date !== day) cal.workoutActions.moveTo(item.workout, day);
    } else if (canMoveEvent(item.occurrence.event) && item.fromDay !== day) {
      void cal.moveEvent(item.occurrence.event, moveEventPatch(item.occurrence.event, item.fromDay, day));
    }
  }

  return (
    <>
      <CalendarHeader
        eyebrow={`Calendario · Settimana ${week}`}
        title={`${Number(from.slice(8))}–${shortDate(days[6])}`}
        prevLabel="Settimana precedente"
        nextLabel="Settimana successiva"
        showToday={from !== thisWeek}
        onPrev={() => setAnchor(addDays(from, -7))}
        onNext={() => setAnchor(addDays(from, 7))}
        onToday={() => setAnchor(null)}
      />

      {cal.failed ? (
        <CalendarError offline={cal.offline} onRetry={cal.retry} />
      ) : cal.missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico la settimana…
        </p>
      ) : (
        <>
          {period.length > 0 ? (
            <section aria-label="Periodo" className="flex flex-col gap-2 rounded-[14px] border border-dashed border-line-2 px-3 py-3">
              <h2 className="label-mono flex items-center justify-between gap-3">
                Periodo
                <span className="hidden normal-case tracking-normal text-text-3 md:inline">Trascina su un giorno per fissarla</span>
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
                {period.map((t) => (
                  <li key={t.id}>
                    <TaskChip
                      task={t}
                      area={areaById.get(t.area_id ?? "")}
                      meta={t.due_date ? dueLabel(t.due_date, today) : undefined}
                      onDragStart={setDragged}
                      onDragEnd={() => setDragged(null)}
                      onEdit={cal.setEditor}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Mobile: elenco dei sette giorni; il tocco apre il giorno. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {views.map((view) => {
              const { items, more } = dayHighlights(view);
              const isToday = view.day === today;
              return (
                <li key={view.day}>
                  <button
                    type="button"
                    onClick={() => cal.openDay(view.day)}
                    className="flex w-full flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-[17px] capitalize ${isToday ? "text-accent" : "text-text"}`}>{weekdayName(view.day)}</span>
                        <span className="text-sm text-text-3">{shortDate(view.day)}</span>
                      </span>
                      <span className="text-xs text-text-3">
                        {LOAD_LABEL[view.load.level].replace("Giornata ", "")}
                        {view.load.minutes ? ` · ${formatDuration(view.load.minutes)}` : ""}
                      </span>
                    </span>
                    <span aria-hidden className="h-[3px] overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${view.load.ratio * 100}%` }} />
                    </span>
                    {items.length > 0 ? (
                      <span className="flex flex-col gap-1">
                        {items.map((item) => (
                          <span key={item.key} className="flex items-baseline gap-2.5 text-sm">
                            <span className="w-10 shrink-0 font-mono text-[11.5px] text-text-3">{item.time ?? "—"}</span>
                            <span className={`min-w-0 break-words ${item.done ? "text-text-3 line-through" : "text-text-2"}`}>{item.title}</span>
                            {item.kind === "workout" ? (
                              <>
                                <WorkoutMark className="self-center" />
                                <span className="sr-only">Allenamento</span>
                              </>
                            ) : null}
                            {item.important && !item.done ? <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold">Importante</span> : null}
                          </span>
                        ))}
                        {more > 0 ? <span className="pl-[50px] text-xs text-text-3">{more === 1 ? "e un'altra cosa" : `e altre ${more}`}</span> : null}
                      </span>
                    ) : (
                      <span className="text-sm text-text-3">Niente in programma</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <WeekGrid
            views={views}
            today={today}
            nowTime={localTimeString(cal.now, tz)}
            areaById={areaById}
            dragged={dragged}
            onDragStart={setDragged}
            onDragEnd={() => setDragged(null)}
            onDropOn={dropOn}
            onOpenDay={cal.openDay}
            onEdit={cal.setEditor}
            onEditWorkout={cal.setWorkout}
          />

          <button
            type="button"
            onClick={() => cal.setEditor({ kind: "new", day: days.includes(today) ? today : from })}
            className="-ml-2.5 hidden min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text md:flex"
          >
            <Icon name="plus" size={16} />
            Aggiungi
          </button>
        </>
      )}

      {cal.editor ? (
        <ItemEditor
          key={cal.editor.kind === "task" ? cal.editor.task.id : cal.editor.kind === "event" ? cal.editor.occurrence.key : "new"}
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
