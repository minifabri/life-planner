"use client";

import { useState } from "react";
import { getISOWeek } from "date-fns";
import { CalendarError, CalendarHeader } from "@/components/calendar/calendar-header";
import { useCalendar } from "@/components/calendar/use-calendar";
import { TaskChip, WeekGrid, type Dragged } from "@/components/calendar/week-grid";
import { AreaDot } from "@/components/today/task-row";
import { DaySigns } from "@/components/days/day-signs";
import { ItemEditor } from "@/components/today/item-editor";
import { KindIcon } from "@/components/today/quiet-events";
import { Icon } from "@/components/ui/icon";
import { Diamond } from "@/components/ui/marks";
import { useToast } from "@/components/ui/toast";
import { canMoveEvent, dayHighlights, freeLabel, moveEventPatch, periodTasks, weekDays } from "@/lib/calendar/view";
import { addDays, dueLabel, localTimeString, shortDate, weekStart, weekdayName, type LocalDate } from "@/lib/dates/local";
import { daySigns, signsText } from "@/lib/days/marks";
import { displayTitle, KIND_LABEL } from "@/lib/events/kind";
import { WorkoutIcon } from "@/components/workouts/workout-row";
import { WorkoutSheet } from "@/components/workouts/workout-sheet";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { updateTask } from "@/lib/data/api";

export default function WeekPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  // Finché non si sceglie una settimana si segue quella corrente.
  const [anchor, setAnchor] = useState<LocalDate | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const toast = useToast();
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
    // Conferma dello spostamento, con il tempo per annullarlo.
    const moved = (title: string, undo: () => void) =>
      toast({ message: `Spostata: ${title} → ${weekdayName(day).slice(0, 3)} ${Number(day.slice(8))}`, actionLabel: "Annulla", onAction: undo });
    if ("task" in item) {
      const { task } = item;
      if (task.date === day) return;
      void actions.moveTo(task, day).then((ok) => {
        if (ok) moved(task.title, () => void updateTask({ ...task, date: day }, { date: task.date, original_date: task.original_date }));
      });
    } else if ("workout" in item) {
      if (item.workout.date !== day) cal.workoutActions.moveTo(item.workout, day);
    } else if (canMoveEvent(item.occurrence.event) && item.fromDay !== day) {
      const { event } = item.occurrence;
      const patch = moveEventPatch(event, item.fromDay, day);
      void cal.moveEvent(event, patch).then(() =>
        moved(event.title, () => void cal.moveEvent({ ...event, ...patch }, { start_date: event.start_date, end_date: event.end_date, start_at: event.start_at, end_at: event.end_at })),
      );
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
                <span data-tour="calendar-period" className="hidden normal-case tracking-normal text-text-3 md:inline">Trascina su un giorno per fissarla</span>
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
          <ul className="flex flex-col md:hidden" data-tour="calendar-days">
            {views.map((view) => {
              const { items, more } = dayHighlights(view);
              const isToday = view.day === today;
              // Gli allenamenti sono già tra le voci del giorno: qui solo ufficio e viaggio.
              const signs = daySigns(view.day, cal.marks, [], today);
              return (
                <li key={view.day} className="flex items-start gap-1 border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => cal.openDay(view.day)}
                    aria-label={`${weekdayName(view.day)} ${shortDate(view.day)}${isToday ? ", oggi" : ""}${signs.length ? `, ${signsText(signs)}` : ""}: ${freeLabel(view)}${view.quiet.map((o) => `, ${KIND_LABEL[o.event.kind].toLowerCase()}: ${displayTitle(o.event)}`).join("")}`}
                    className={`flex min-w-0 flex-1 gap-3.5 rounded-xl py-3.5 pr-1 text-left hover:bg-surface ${isToday ? "bg-accent-soft" : ""}`}
                  >
                    <span className="flex w-[46px] shrink-0 flex-col items-center gap-1 pt-0.5">
                      <span className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${isToday ? "text-accent" : "text-text-3"}`}>{weekdayName(view.day).slice(0, 3)}</span>
                      <span className={`flex size-[34px] items-center justify-center rounded-full text-[17px] ${isToday ? "bg-accent-fill font-semibold text-on-accent" : "text-text"}`}>
                        {Number(view.day.slice(8))}
                      </span>
                      {signs.length ? <DaySigns signs={signs} /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
                          <span className={`block h-full rounded-full ${view.load.level === "full" ? "bg-accent" : "bg-text-3"}`} style={{ width: `${view.load.ratio * 100}%` }} />
                        </span>
                        <span className="whitespace-nowrap font-mono text-[11px] text-text-3">{freeLabel(view)}</span>
                      </span>
                      {view.quiet.length ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
                          {view.quiet.map((o) => (
                            <span key={o.key} className="flex min-w-0 items-center gap-1.5">
                              <KindIcon kind={o.event.kind} title={o.event.title} size={12} />
                              <span className="sr-only">{KIND_LABEL[o.event.kind]}: </span>
                              <span className="min-w-0 truncate">{displayTitle(o.event)}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {items.map((item) => {
                        const gold = (item.deadline || item.important) && !item.done;
                        return (
                          <span key={item.key} className="flex min-w-0 items-center gap-2.5 text-sm">
                            <span className="w-10 shrink-0 font-mono text-[11.5px] text-text-3">{item.time ?? "—"}</span>
                            {gold ? (
                              <Diamond label={item.deadline ? "Scadenza" : "Importante"} />
                            ) : item.kind === "workout" ? (
                              <>
                                {item.done ? <Icon name="check" size={13} strokeWidth={2.2} className="shrink-0 text-workout" /> : <WorkoutIcon size={12} />}
                                <span className="sr-only">{item.done ? "Allenamento fatto" : "Allenamento"}</span>
                              </>
                            ) : item.kind === "event" ? (
                              <AreaDot area={areaById.get(item.areaId ?? "")} fallback />
                            ) : (
                              <span aria-hidden className="size-2 shrink-0 rounded-full border-[1.3px] border-text-3" />
                            )}
                            {item.event && item.event.kind !== "event" ? (
                              <span className="-mr-1 text-text-3">
                                <KindIcon kind={item.event.kind} title={item.event.title} size={12} />
                              </span>
                            ) : null}
                            <span className={`min-w-0 truncate ${item.done ? (item.kind === "workout" ? "text-text-2" : "text-text-3 line-through") : gold ? "text-gold" : item.kind === "event" ? "text-text" : "text-text-2"}`}>
                              {item.title}
                            </span>
                          </span>
                        );
                      })}
                      {more > 0 ? <span className="pl-[50px] text-xs text-text-3">+ {more} {more === 1 ? "altra" : "altre"}</span> : null}
                    </span>
                  </button>
                  {/* Su mobile niente doppio tocco: un "+" accanto al giorno crea direttamente lì. */}
                  <button
                    type="button"
                    onClick={() => cal.setEditor({ kind: "new", day: view.day })}
                    aria-label={`Aggiungi a ${weekdayName(view.day)} ${shortDate(view.day)}`}
                    className="mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>

          <WeekGrid
            views={views}
            today={today}
            marks={cal.marks}
            nowTime={localTimeString(cal.now, tz)}
            areaById={areaById}
            dragged={dragged}
            onDragStart={setDragged}
            onDragEnd={() => setDragged(null)}
            onDropOn={dropOn}
            onOpenDay={cal.openDay}
            onEdit={cal.setEditor}
            onEditWorkout={cal.setWorkout}
            onCreate={(day, draft) => cal.setEditor({ kind: "new", day, draft })}
          />

          <button
            type="button"
            onClick={() => cal.setEditor({ kind: "new", day: days.includes(today) ? today : from })}
            className="-ml-2.5 hidden min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text md:flex"
          >
            <Icon name="plus" size={16} />
            Aggiungi
            <span className="text-xs text-text-3">· o doppio clic su un giorno</span>
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
