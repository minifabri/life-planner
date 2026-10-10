"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EventBlock } from "@/components/today/event-block";
import { ItemEditor, type EditorTarget } from "@/components/today/item-editor";
import { RescheduleDialog } from "@/components/today/reschedule-dialog";
import { RowAction, TaskRow } from "@/components/today/task-row";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/page-header";
import {
  useAreas,
  useEvents,
  useOffline,
  useTaskActions,
  useTasks,
  useTimezone,
  useToday,
} from "@/lib/data/hooks";
import {
  addDays,
  atLocalTime,
  dueLabel,
  formatDuration,
  localTimeString,
  relativeDay,
  trimTime,
  type LocalDate,
} from "@/lib/dates/local";
import { todayHeading } from "@/lib/dates/today";
import { takeRequestedDay } from "@/lib/nav/day-handoff";
import { eventsForDay, type Occurrence } from "@/lib/events/day";
import { groupTasks, overdueSince, windowSummary } from "@/lib/tasks/classify";
import { LOAD_LABEL, dayLoad } from "@/lib/tasks/load";
import type { Task } from "@/lib/supabase/types";

type AgendaItem = { key: string; time: string | null; task?: Task; occurrence?: Occurrence };

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.closest("input, textarea, select, [role=dialog]") !== null || target.isContentEditable);
}

export default function TodayPage() {
  const tz = useTimezone();
  const { today, now } = useToday(tz);
  // Arrivando da Settimana o Mese si apre il giorno scelto lì.
  const [selected, setSelected] = useState<LocalDate | null>(takeRequestedDay);
  const day = selected ?? today;
  const isToday = day === today;

  const tasksQuery = useTasks(day, tz);
  const eventsQuery = useEvents(day, tz);
  const areas = useAreas().data;
  const actions = useTaskActions(today, tz);

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);

  const go = (delta: number) => setSelected(addDays(day, delta));
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // Desktop: frecce per cambiare giorno (N apre il Quick Capture, da qualsiasi schermata).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      if (e.key === "ArrowLeft") goRef.current(-1);
      else if (e.key === "ArrowRight") goRef.current(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mobile: swipe orizzontale per cambiare giorno (le frecce restano l'alternativa visibile).
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = isTyping(e.target) ? null : { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1);
  }

  const areaById = new Map((areas ?? []).map((a) => [a.id, a]));
  const sections = groupTasks(tasksQuery.data ?? [], day, today, tz);
  const occurrences = eventsQuery.data ? eventsForDay(eventsQuery.data.events, eventsQuery.data.exceptions, day, tz) : [];

  const agenda: AgendaItem[] = [
    ...occurrences.map((o) => ({ key: o.key, time: o.startTime, occurrence: o })),
    ...sections.agenda.map((t) => ({ key: t.id, time: t.time ? trimTime(t.time) : null, task: t })),
  ].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const nowTime = localTimeString(now, tz);
  const nowIndex = isToday ? agenda.findIndex((i) => i.time !== null && i.time > nowTime) : -1;

  const load = dayLoad([
    ...occurrences.map((o) => o.durationMin),
    ...[...sections.agenda, ...sections.todo].filter((t) => t.status === "open").map((t) => t.duration_min),
  ]);

  const h = todayHeading(atLocalTime(day, "12:00", tz), tz);
  const eyebrow = isToday ? "Oggi" : relativeDay(day, today);
  // Con dati in cache si mostrano quelli, anche se l'aggiornamento non riesce: l'avviso di rete è nella barra in alto.
  const missing = tasksQuery.data === undefined || eventsQuery.data === undefined;
  const offline = useOffline();
  const failed = missing && (offline || tasksQuery.isError || eventsQuery.isError);
  const loading = missing && !failed;
  const openTask = (task: Task) => setEditor({ kind: "task", task });

  const nowLine = (
    <li aria-label={`Adesso, ${nowTime}`} className="flex items-center gap-2 py-1">
      <span className="font-mono text-[10.5px] tracking-[0.08em] text-accent">{nowTime}</span>
      <span className="h-px flex-1 bg-accent" />
    </li>
  );

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="label-mono">
              {eyebrow} · Settimana {h.week}
            </span>
            <h1 className="text-[34px] font-light leading-[1.05] tracking-[-0.02em] md:text-[40px]">
              {h.weekday} <span className="text-text-3">{h.dayMonth}</span>
            </h1>
          </div>
          <div className="-mr-2.5 flex">
            <button type="button" onClick={() => go(-1)} aria-label="Giorno precedente" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
              <Icon name="chevronLeft" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Giorno successivo" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
              <Icon name="chevronRight" />
            </button>
            <Link href="/settings" aria-label="Impostazioni" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text md:hidden">
              <Icon name="settings" />
            </Link>
          </div>
        </div>
        <div className="flex min-h-6 items-center gap-3">
          <div
            role="img"
            aria-label={`${LOAD_LABEL[load.level]}${load.minutes ? `: ${formatDuration(load.minutes)} impegnati` : ""}`}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${load.ratio * 100}%` }} />
          </div>
          <span className="text-xs text-text-3">
            {LOAD_LABEL[load.level]}
            {load.minutes ? ` · ${formatDuration(load.minutes)}` : ""}
          </span>
          {!isToday ? (
            <button type="button" onClick={() => setSelected(null)} className="-my-2.5 min-h-11 rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2">
              Torna a oggi
            </button>
          ) : null}
        </div>
      </header>

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "Questo giorno non è disponibile senza rete. Offline trovi ieri, oggi e domani." : "Non riesco a caricare i dati. Controlla la connessione."}</p>
          <button
            type="button"
            onClick={() => {
              tasksQuery.refetch();
              eventsQuery.refetch();
            }}
            className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2"
          >
            Riprova
          </button>
        </div>
      ) : null}

      {isToday && sections.overdue.length > 0 ? (
        <section className="flex flex-col">
          <h2>
            <button
              type="button"
              aria-expanded={overdueOpen}
              onClick={() => setOverdueOpen((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 text-sm text-text-2 hover:text-text"
            >
              <span>
                {sections.overdue.length === 1 ? "1 rimasta indietro" : `${sections.overdue.length} rimaste indietro`}
              </span>
              <Icon name="chevronRight" size={16} className={`transition-transform ${overdueOpen ? "rotate-90" : ""}`} />
            </button>
          </h2>
          {overdueOpen ? (
            <ul className="flex flex-col pt-1">
              {sections.overdue.map((t) => {
                const since = overdueSince(t);
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    area={areaById.get(t.area_id ?? "")}
                    meta={since ? `da ${relativeDay(since, today)}` : undefined}
                    showTime
                    onToggle={() => actions.toggle(t)}
                    onOpen={() => openTask(t)}
                    actions={
                      <>
                        <RowAction label={`Sposta a oggi: ${t.title}`} onClick={() => actions.moveToToday(t)}>
                          Oggi
                        </RowAction>
                        <RowAction label={`Riprogramma: ${t.title}`} onClick={() => setRescheduling(t)}>
                          Riprogramma
                        </RowAction>
                      </>
                    }
                  />
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {failed ? null : (
        <>
          <Section title="Agenda">
            {loading ? (
              <Skeleton />
            ) : agenda.length === 0 ? (
              <EmptyState title="Niente in programma." hint="Gli appuntamenti e le attività con orario compaiono qui." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {agenda.map((item, i) => (
                  <AgendaRow key={item.key} time={item.time} before={i === nowIndex ? nowLine : null}>
                    {item.occurrence ? (
                      <EventBlock
                        occurrence={item.occurrence}
                        area={areaById.get(item.occurrence.event.area_id ?? "")}
                        onOpen={() => setEditor({ kind: "event", occurrence: item.occurrence! })}
                      />
                    ) : (
                      <TaskRow
                        task={item.task!}
                        area={areaById.get(item.task!.area_id ?? "")}
                        onToggle={() => actions.toggle(item.task!)}
                        onOpen={() => openTask(item.task!)}
                      />
                    )}
                  </AgendaRow>
                ))}
                {isToday && nowIndex === -1 && agenda.some((i) => i.time !== null) ? nowLine : null}
              </ul>
            )}
          </Section>

          <Section title={isToday ? "Da fare oggi" : "Da fare"}>
            {loading ? (
              <Skeleton />
            ) : sections.todo.length === 0 ? (
              <EmptyState title={isToday ? "Giornata libera." : "Niente da fare."} hint="Tocca + per aggiungere qualcosa." />
            ) : (
              <ul className="flex flex-col">
                {sections.todo.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    area={areaById.get(t.area_id ?? "")}
                    // Per le preparazioni dei pasti il dettaglio è il piatto.
                    meta={t.source === "meal" && t.notes ? t.notes : t.due_date && t.status === "open" ? dueLabel(t.due_date, today) : undefined}
                    onToggle={() => actions.toggle(t)}
                    onOpen={() => openTask(t)}
                  />
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setEditor({ kind: "new", day })}
              className="-ml-2.5 flex min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <Icon name="plus" size={16} />
              Aggiungi
            </button>
          </Section>
        </>
      )}

      {isToday && sections.window.length > 0 ? (
        <section className="flex flex-col">
          <h2>
            <button
              type="button"
              aria-expanded={windowOpen}
              onClick={() => setWindowOpen((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-3.5 py-2 text-left text-sm text-text-2 hover:text-text"
            >
              <span>{windowSummary(sections.window, today)}</span>
              <Icon name="chevronRight" size={16} className={`shrink-0 transition-transform ${windowOpen ? "rotate-90" : ""}`} />
            </button>
          </h2>
          {windowOpen ? (
            <ul className="flex flex-col pt-1">
              {sections.window.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  area={areaById.get(t.area_id ?? "")}
                  meta={t.due_date ? dueLabel(t.due_date, today) : undefined}
                  onToggle={() => actions.toggle(t)}
                  onOpen={() => openTask(t)}
                  actions={
                    <RowAction label={`Fai oggi: ${t.title}`} onClick={() => actions.moveToToday(t)}>
                      Oggi
                    </RowAction>
                  }
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {editor ? (
        <ItemEditor
          key={editor.kind === "task" ? editor.task.id : editor.kind === "event" ? editor.occurrence.key : "new"}
          target={editor}
          today={today}
          tz={tz}
          onClose={() => setEditor(null)}
          onDeleteTask={actions.remove}
        />
      ) : null}

      {rescheduling ? (
        <RescheduleDialog
          task={rescheduling}
          today={today}
          onClose={() => setRescheduling(null)}
          onMove={(date) => {
            actions.moveTo(rescheduling, date);
            setRescheduling(null);
          }}
          onDismiss={() => {
            actions.dismiss(rescheduling);
            setRescheduling(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-mono">{title}</h2>
      {children}
    </section>
  );
}

/** Riga dell'agenda: orario a sinistra, contenuto a destra. */
function AgendaRow({ time, before, children }: { time: string | null; before: ReactNode; children: ReactNode }) {
  return (
    <>
      {before}
      <li className="flex gap-3">
        <span className="w-11 shrink-0 pt-3 font-mono text-xs text-text-3">{time ?? "—"}</span>
        <ul className="min-w-0 flex-1">{children}</ul>
      </li>
    </>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Caricamento" className="flex flex-col gap-2">
      <div className="h-11 animate-pulse rounded-xl bg-surface" />
      <div className="h-11 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
