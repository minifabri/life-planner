"use client";

import { useState } from "react";
import { CalendarError, CalendarHeader } from "@/components/calendar/calendar-header";
import { LockSheet } from "@/components/log/lock-sheet";
import { useCalendar } from "@/components/calendar/use-calendar";
import { EventBlock } from "@/components/today/event-block";
import { ItemEditor } from "@/components/today/item-editor";
import { QuietEvents } from "@/components/today/quiet-events";
import { TaskRow } from "@/components/today/task-row";
import { Icon } from "@/components/ui/icon";
import { Diamond } from "@/components/ui/marks";
import { WorkoutMark, WorkoutRow } from "@/components/workouts/workout-row";
import { WorkoutSheet } from "@/components/workouts/workout-sheet";
import { dayMarks, monthGrid, monthStart, type DayMarks } from "@/lib/calendar/view";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { useCyclePrediction } from "@/lib/data/cycle-hooks";
import { useLogUnlocked, useOpenEntries, usePrivateStubs } from "@/lib/data/log-hooks";
import { lockLog } from "@/lib/lock/session";
import { logDays } from "@/lib/log/timeline";
import type { CyclePrediction } from "@/lib/cycle/predict";
import { addMonths, dueLabel, relativeDay, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function monthTitle(month: LocalDate) {
  const name = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function describe(marks: DayMarks): string {
  const parts = [
    marks.events ? (marks.events === 1 ? "1 evento" : `${marks.events} eventi`) : null,
    marks.lessons ? (marks.lessons === 1 ? "1 lezione" : `${marks.lessons} lezioni`) : null,
    marks.tasks ? (marks.tasks === 1 ? "1 attività" : `${marks.tasks} attività`) : null,
    marks.deadlines ? (marks.deadlines === 1 ? "1 scadenza" : `${marks.deadlines} scadenze`) : null,
    marks.workouts ? (marks.workouts === 1 ? "1 allenamento" : `${marks.workouts} allenamenti`) : null,
    marks.birthdays ? (marks.birthdays === 1 ? "1 compleanno" : `${marks.birthdays} compleanni`) : null,
    marks.shipments ? (marks.shipments === 1 ? "1 spedizione" : `${marks.shipments} spedizioni`) : null,
    marks.important ? "cose importanti" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "niente in programma";
}

/** Riga sotto la legenda: da cosa nasce la stima e quando arriva il prossimo ciclo. */
function cycleNote(cycle: CyclePrediction, today: LocalDate): string {
  const basis = cycle.basedOn
    ? `Ciclo medio di ${cycle.cycleDays} giorni (${cycle.basedOn === 1 ? "dall’ultimo ciclo" : `dagli ultimi ${cycle.basedOn} cicli`}).`
    : `Con un solo ciclo registrato la stima usa ${cycle.cycleDays} giorni.`;
  const next =
    cycle.lateDays > 14
      ? "L’ultimo ciclo registrato è lontano: se ne manca uno, aggiungilo nel Log."
      : cycle.lateDays > 0
        ? `In ritardo di ${cycle.lateDays === 1 ? "1 giorno" : `${cycle.lateDays} giorni`}.`
        : `Prossimo ciclo previsto: ${relativeDay(cycle.nextStart, today)}.`;
  return `${basis} ${next}`;
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
  // Ciclo previsto e giorni fertili (D68): solo a Log sbloccato.
  const unlocked = useLogUnlocked();
  const [locking, setLocking] = useState(false);
  const cycle = useCyclePrediction(today, days[0], days[days.length - 1]);

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
                const period = cycle?.period.has(view.day) ?? false;
                const fertile = cycle?.fertile.has(view.day) ?? false;
                return (
                  <button
                    key={view.day}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${weekdayName(view.day)} ${shortDate(view.day)}: ${describe(marks)}${hasLog ? ", registrazioni nel Log" : ""}${period ? ", ciclo previsto" : ""}${fertile ? ", giorno fertile" : ""}`}
                    onClick={() => setPicked(view.day)}
                    onDoubleClick={() => cal.openDay(view.day)}
                    className={`flex min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-xl border text-sm transition-colors md:min-h-[72px] ${
                      active ? "border-line-2 bg-surface-2" : "border-transparent hover:bg-surface-2"
                    } ${inMonth ? "" : "opacity-45"}`}
                  >
                    <span
                      className={`flex size-[26px] items-center justify-center rounded-full ${view.day === today ? "bg-accent-fill font-semibold text-on-accent" : fertile ? "bg-fertile-soft text-text" : "text-text"} ${
                        period ? "outline-[1.5px] outline-offset-1 outline-cycle outline-dashed" : ""
                      }`}
                    >
                      {Number(view.day.slice(8))}
                    </span>
                    {/* Segni minimi, mai testo nelle celle. */}
                    <span aria-hidden className="flex h-1.5 items-center gap-[3px]">
                      {marks.deadlines || marks.important ? <Diamond size={5} /> : null}
                      {marks.events ? <span className="size-[5px] rounded-full bg-text-2" /> : null}
                      {marks.lessons ? <span className="size-[5px] rounded-full bg-[var(--area-teach)]" /> : null}
                      {marks.tasks ? <span className="size-1.5 rounded-full border-[1.2px] border-text-3" /> : null}
                      {marks.workouts ? <WorkoutMark /> : null}
                      {hasLog ? <span className="h-px w-1.5 bg-text-2" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-1 text-[11.5px] text-text-3">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-[5px] rounded-full bg-text-2" /> Appuntamenti
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-[5px] rounded-full bg-[var(--area-teach)]" /> Lezioni
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full border-[1.2px] border-text-3" /> Attività
              </span>
              <span className="flex items-center gap-1.5">
                <Diamond size={5} /> Scadenze e importanti
              </span>
              <span className="flex items-center gap-1.5">
                <WorkoutMark /> Allenamenti
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-px w-1.5 bg-text-2" /> Log
              </span>
              {cycle ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-3 rounded-full outline-[1.5px] outline-cycle outline-dashed" /> Ciclo previsto
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="size-3 rounded-full bg-fertile-soft" /> Giorni fertili
                  </span>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => (unlocked ? lockLog() : setLocking(true))}
                className="-my-3 -ml-1.5 flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="lock" size={12} />
                {unlocked ? "Nascondi riservati" : "Mostra riservati"}
              </button>
            </p>
            {cycle ? (
              <p className="text-[11.5px] leading-relaxed text-text-3">
                {cycleNote(cycle, today)} Solo una stima del calendario: non è un metodo contraccettivo.
              </p>
            ) : null}
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
              <QuietEvents occurrences={preview.quiet} onOpen={(occurrence) => cal.setEditor({ kind: "event", occurrence })} className="-mt-1.5" />
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
      {locking ? <LockSheet onClose={() => setLocking(false)} /> : null}
      {cal.workout ? (
        <WorkoutSheet key={cal.workout.id} target={{ kind: "edit", workout: cal.workout }} today={today} onClose={() => cal.setWorkout(null)} />
      ) : null}
    </>
  );
}
