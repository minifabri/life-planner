"use client";

import { useState } from "react";
import { CalendarError, CalendarHeader } from "@/components/calendar/calendar-header";
import { useCalendar } from "@/components/calendar/use-calendar";
import { EventBlock } from "@/components/today/event-block";
import { ItemEditor } from "@/components/today/item-editor";
import { TaskRow } from "@/components/today/task-row";
import { Icon } from "@/components/ui/icon";
import { WorkoutMark, WorkoutRow } from "@/components/workouts/workout-row";
import { WorkoutSheet } from "@/components/workouts/workout-sheet";
import { dayMarks, monthGrid, monthStart, type DayMarks } from "@/lib/calendar/view";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { useOpenEntries, usePrivateStubs } from "@/lib/data/log-hooks";
import { logDays } from "@/lib/log/timeline";
import { addMonths, dueLabel, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function monthTitle(month: LocalDate) {
  const name = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function describe(marks: DayMarks): string {
  const parts = [
    marks.events ? (marks.events === 1 ? "1 evento" : `${marks.events} eventi`) : null,
    marks.tasks ? (marks.tasks === 1 ? "1 attività" : `${marks.tasks} attività`) : null,
    marks.deadlines ? (marks.deadlines === 1 ? "1 scadenza" : `${marks.deadlines} scadenze`) : null,
    marks.workouts ? (marks.workouts === 1 ? "1 allenamento" : `${marks.workouts} allenamenti`) : null,
    marks.important ? "cose importanti" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "niente in programma";
}

export default function MonthPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const [anchor, setAnchor] = useState<LocalDate | null>(null);
  const [picked, setPicked] = useState<LocalDate | null>(null);
  const month = anchor ?? monthStart(today);
  const days = monthGrid(month);
  const cal = useCalendar(days);
  const { views, areaById, actions } = cal;
  // Segno discreto del Log (D24): dice solo che in quel giorno c'è una registrazione, riservata o no.
  const logged = logDays(useOpenEntries().data ?? [], usePrivateStubs().data ?? []);

  // L'anteprima segue il giorno toccato; se non è in questo mese, oggi (quando si vede) o il primo.
  const fallback = days.includes(today) && monthStart(today) === month ? today : month;
  const selected = picked && days.includes(picked) ? picked : fallback;
  const preview = views.find((v) => v.day === selected);

  function go(delta: number) {
    setAnchor(addMonths(month, delta));
    setPicked(null);
  }

  return (
    <>
      <CalendarHeader
        eyebrow="Calendario"
        title={monthTitle(month)}
        muted={month.slice(0, 4)}
        prevLabel="Mese precedente"
        nextLabel="Mese successivo"
        showToday={month !== monthStart(today)}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={() => {
          setAnchor(null);
          setPicked(null);
        }}
      />

      {cal.failed ? (
        <CalendarError offline={cal.offline} onRetry={cal.retry} />
      ) : cal.missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico il mese…
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div aria-hidden className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <span key={d} className="text-center font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">
                  {d}
                </span>
              ))}
            </div>
            <div role="group" aria-label={`${monthTitle(month)} ${month.slice(0, 4)}`} className="grid grid-cols-7 gap-1">
              {views.map((view) => {
                const marks = dayMarks(view, cal.tasks);
                const inMonth = view.day.slice(0, 7) === month.slice(0, 7);
                const active = view.day === selected;
                const hasLog = logged.has(view.day);
                return (
                  <button
                    key={view.day}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${weekdayName(view.day)} ${shortDate(view.day)}: ${describe(marks)}${hasLog ? ", registrazioni nel Log" : ""}`}
                    onClick={() => setPicked(view.day)}
                    onDoubleClick={() => cal.openDay(view.day)}
                    className={`flex min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-xl border text-sm transition-colors md:min-h-[72px] ${
                      active ? "border-line-2 bg-surface-2" : "border-transparent hover:bg-surface-2"
                    } ${inMonth ? "" : "opacity-45"}`}
                  >
                    <span className={view.day === today ? "text-accent" : "text-text"}>{Number(view.day.slice(8))}</span>
                    {/* Segni minimi, mai testo nelle celle: evento, attività, scadenza, importante. */}
                    <span aria-hidden className="flex h-1.5 items-center gap-[3px]">
                      {marks.events ? <span className="size-1.5 rounded-full bg-text-3" /> : null}
                      {marks.tasks ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                      {marks.deadlines ? <span className="size-1.5 rounded-full border border-accent" /> : null}
                      {marks.workouts ? <WorkoutMark /> : null}
                      {marks.important ? <span className="size-1.5 rounded-full bg-gold" /> : null}
                      {hasLog ? <span className="h-px w-1.5 bg-text-2" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-text-3">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-text-3" /> eventi
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" /> attività
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full border border-accent" /> scadenze
              </span>
              <span className="flex items-center gap-1.5">
                <WorkoutMark /> allenamenti
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-gold" /> importante
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-px w-1.5 bg-text-2" /> Log
              </span>
            </p>
          </div>

          {preview ? (
            <section aria-live="polite" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="label-mono">
                  {weekdayName(preview.day)} {shortDate(preview.day)}
                  {preview.day === today ? " · oggi" : ""}
                </h2>
                <button
                  type="button"
                  onClick={() => cal.openDay(preview.day)}
                  className="-mr-2.5 flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2"
                >
                  Apri il giorno
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
              {preview.occurrences.length + preview.timed.length + preview.untimed.length + preview.workouts.length === 0 ? (
                <p className="text-sm text-text-3">Niente in programma.</p>
              ) : (
                <>
                  {preview.occurrences.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {preview.occurrences.map((o) => (
                        <EventBlock key={o.key} occurrence={o} area={areaById.get(o.event.area_id ?? "")} onOpen={() => cal.setEditor({ kind: "event", occurrence: o })} />
                      ))}
                    </ul>
                  ) : null}
                  <ul className="flex flex-col">
                    {[...preview.timed, ...preview.untimed].map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        area={areaById.get(t.area_id ?? "")}
                        showTime
                        meta={t.due_date && t.status === "open" ? dueLabel(t.due_date, today) : undefined}
                        onToggle={() => actions.toggle(t)}
                        onOpen={() => cal.setEditor({ kind: "task", task: t })}
                      />
                    ))}
                    {preview.workouts.map((w) => (
                      <WorkoutRow key={w.id} workout={w} today={today} onToggle={() => cal.workoutActions.toggle(w)} onOpen={() => cal.setWorkout(w)} />
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                onClick={() => cal.setEditor({ kind: "new", day: preview.day })}
                className="-ml-2.5 flex min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="plus" size={16} />
                Aggiungi
              </button>
            </section>
          ) : null}
        </>
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
