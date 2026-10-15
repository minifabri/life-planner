"use client";

import { useState, type MouseEvent } from "react";
import { DaySigns } from "@/components/days/day-signs";
import { KindIcon } from "@/components/today/quiet-events";
import { AreaDot } from "@/components/today/task-row";
import { AttentionMark, Diamond } from "@/components/ui/marks";
import { WorkoutMark } from "@/components/workouts/workout-row";
import type { EditorDraft, EditorTarget } from "@/components/today/item-editor";
import { canMoveEvent, hourRange, layoutBlocks, slotAt, timeToMinutes, timedBlocks, type DayView } from "@/lib/calendar/view";
import { formatDuration, shortDate, trimTime, weekdayName, type LocalDate } from "@/lib/dates/local";
import { daySigns, signsText } from "@/lib/days/marks";
import type { Occurrence } from "@/lib/events/day";
import { displayTitle, KIND_LABEL } from "@/lib/events/kind";
import type { Area, DayMark, Task, Workout } from "@/lib/supabase/types";
import { LOAD_LABEL } from "@/lib/tasks/load";

/** Altezza di un'ora e durata minima disegnata: un blocco non scende mai sotto i 44 px toccabili. */
const HOUR_PX = 56;
const MIN_BLOCK_MIN = Math.ceil((46 / HOUR_PX) * 60);

export type Dragged = { task: Task } | { workout: Workout } | { occurrence: Occurrence; fromDay: LocalDate };

/** Il doppio clic crea solo sullo spazio libero: sopra un elemento vale il suo clic. */
function onEmptySpace(e: MouseEvent) {
  return !(e.target as Element).closest("button, a, input, label");
}

const chipClass =
  "flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-[10px] border px-2 py-1.5 text-left text-[13px] leading-snug hover:bg-surface-2";

/** Settimana su desktop: sette colonne con attività in testa ed eventi posizionati sull'orario; gli spazi vuoti restano vuoti. */
export function WeekGrid({
  views,
  today,
  marks,
  nowTime,
  areaById,
  dragged,
  onDragStart,
  onDragEnd,
  onDropOn,
  onOpenDay,
  onEdit,
  onEditWorkout,
  onCreate,
}: {
  views: DayView[];
  today: LocalDate;
  /** Segni dei giorni (ufficio, viaggio): piccole icone accanto alla data. */
  marks: DayMark[];
  nowTime: string;
  areaById: Map<string, Area>;
  dragged: Dragged | null;
  onDragStart: (item: Dragged) => void;
  onDragEnd: () => void;
  onDropOn: (day: LocalDate) => void;
  onOpenDay: (day: LocalDate) => void;
  onEdit: (target: EditorTarget) => void;
  onEditWorkout: (workout: Workout) => void;
  /** Doppio clic su uno spazio libero del giorno: nuovo elemento, con l'orario se il clic è sulla griglia. */
  onCreate: (day: LocalDate, draft?: EditorDraft) => void;
}) {
  const [over, setOver] = useState<LocalDate | null>(null);
  const blocksByDay = views.map((v) => timedBlocks(v));
  const { startHour, endHour } = hourRange(blocksByDay.flat());
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const top = (min: number) => ((min - startHour * 60) / 60) * HOUR_PX;

  return (
    <div className="hidden md:flex">
      <div aria-hidden className="w-11 shrink-0">
        {/* Spazio dell'intestazione e delle attività: l'altezza la decide la colonna più alta. */}
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-px rounded-[14px] border border-line bg-line">
        {views.map((view, index) => {
          const isToday = view.day === today;
          const signs = daySigns(view.day, marks, [], today);
          const allDay = view.occurrences.filter((o) => o.allDay);
          const placed = layoutBlocks(blocksByDay[index], MIN_BLOCK_MIN);
          return (
            <section
              key={view.day}
              aria-label={`${weekdayName(view.day)} ${shortDate(view.day)}`}
              onDragOver={(e) => {
                if (!dragged) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== view.day) setOver(view.day);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                onDropOn(view.day);
              }}
              className={`flex min-w-0 flex-col bg-bg first:rounded-l-[13px] last:rounded-r-[13px] ${over === view.day ? "bg-surface-2" : ""}`}
            >
              <button
                type="button"
                onClick={() => onOpenDay(view.day)}
                aria-label={`Apri ${weekdayName(view.day)} ${shortDate(view.day)}: ${LOAD_LABEL[view.load.level].toLowerCase()}${signs.length ? `, ${signsText(signs)}` : ""}`}
                className={`flex min-h-11 flex-col gap-1.5 px-2 pb-2 pt-2.5 text-left hover:bg-surface-2 ${isToday ? "bg-accent-soft" : ""}`}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className={`font-mono text-[10.5px] uppercase tracking-[0.08em] ${isToday ? "text-accent" : "text-text-3"}`}>{weekdayName(view.day).slice(0, 3)}</span>
                  <span className={`text-xl ${isToday ? "font-medium text-accent" : "font-light text-text"}`}>{Number(view.day.slice(8))}</span>
                  <DaySigns signs={signs} size={12} className="ml-auto self-center" />
                </span>
                <span className="h-[3px] overflow-hidden rounded-full bg-line">
                  <span className={`block h-full rounded-full ${view.load.level === "full" ? "bg-accent" : "bg-text-3"}`} style={{ width: `${view.load.ratio * 100}%` }} />
                </span>
              </button>

              <ul
                onDoubleClick={(e) => {
                  if (onEmptySpace(e)) onCreate(view.day);
                }}
                className="flex min-h-[52px] flex-col gap-1 border-b border-line px-1 pb-1.5"
              >
                {view.quiet.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => onEdit({ kind: "event", occurrence: o })}
                      className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-[10px] px-2 text-left text-xs leading-snug text-text-3 hover:bg-surface-2 hover:text-text-2"
                    >
                      <KindIcon kind={o.event.kind} size={12} />
                      <span className="sr-only">{KIND_LABEL[o.event.kind]}: </span>
                      <span className="min-w-0 break-words">{displayTitle(o.event)}</span>
                    </button>
                  </li>
                ))}
                {allDay.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      draggable={canMoveEvent(o.event)}
                      onDragStart={() => onDragStart({ occurrence: o, fromDay: view.day })}
                      onDragEnd={onDragEnd}
                      onClick={() => onEdit({ kind: "event", occurrence: o })}
                      className={`${chipClass} border-line bg-surface`}
                    >
                      <span className="min-w-0 break-words">{o.event.title}</span>
                      <AreaDot area={areaById.get(o.event.area_id ?? "")} />
                    </button>
                  </li>
                ))}
                {view.untimed.map((t) => (
                  <li key={t.id}>
                    <TaskChip
                      task={t}
                      area={areaById.get(t.area_id ?? "")}
                      deadline={!t.date && t.due_date === view.day}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onEdit={onEdit}
                    />
                  </li>
                ))}
                {view.workouts
                  .filter((w) => !w.time)
                  .map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={() => onDragStart({ workout: w })}
                        onDragEnd={onDragEnd}
                        onClick={() => onEditWorkout(w)}
                        className={`${chipClass} border-line-2`}
                      >
                        <span className={`min-w-0 break-words ${w.status === "done" ? "text-text-3 line-through" : ""}`}>{w.activity}</span>
                        <WorkoutMark />
                        <span className="sr-only">Allenamento</span>
                      </button>
                    </li>
                  ))}
              </ul>

              {/* I giorni già passati restano leggibili ma in secondo piano. */}
              <div
                onDoubleClick={(e) => {
                  if (!onEmptySpace(e)) return;
                  const offset = ((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60;
                  const { start, end } = slotAt(offset, startHour);
                  // L'orario vale per qualunque tipo si scelga nel foglio.
                  onCreate(view.day, { type: "event", startTime: start, endTime: end, time: start });
                }}
                className={`relative select-none ${view.day < today ? "opacity-60" : ""}`}
                style={{ height: hours.length * HOUR_PX }}
              >
                {hours.map((h, i) => (
                  <div key={h} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ top: i * HOUR_PX }}>
                    {index === 0 ? (
                      <span className="absolute -left-11 -top-2 w-9 text-right font-mono text-[10.5px] text-text-3">{String(h).padStart(2, "0")}</span>
                    ) : null}
                  </div>
                ))}
                {isToday && timeToMinutes(nowTime) >= startHour * 60 && timeToMinutes(nowTime) <= endHour * 60 ? (
                  <div aria-label={`Adesso, ${nowTime}`} role="img" className="absolute inset-x-0 z-10 h-px bg-accent" style={{ top: top(timeToMinutes(nowTime)) }}>
                    <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-accent" />
                  </div>
                ) : null}
                <ul>
                  {placed.map((b) => {
                    const style = {
                      top: top(b.startMin),
                      height: ((b.endMin - b.startMin) / 60) * HOUR_PX - 2,
                      left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / b.lanes}% - 4px)`,
                    };
                    const time = `${String(Math.floor(b.startMin / 60)).padStart(2, "0")}:${String(b.startMin % 60).padStart(2, "0")}`;
                    if (b.occurrence) {
                      const o = b.occurrence;
                      return (
                        <li key={b.key} className="absolute" style={style}>
                          <button
                            type="button"
                            draggable={canMoveEvent(o.event)}
                            onDragStart={() => onDragStart({ occurrence: o, fromDay: view.day })}
                            onDragEnd={onDragEnd}
                            onClick={() => onEdit({ kind: "event", occurrence: o })}
                            className="flex size-full flex-col overflow-hidden rounded-[10px] border border-line bg-surface px-2 py-1 text-left text-[13px] leading-snug hover:bg-surface-2"
                          >
                            <span className="flex items-center gap-1.5">
                              <AreaDot area={areaById.get(o.event.area_id ?? "")} />
                              <span className="min-w-0 flex-1 truncate font-medium">{o.event.title}</span>
                              <AttentionMark level={o.event.attention} />
                            </span>
                            <span className="truncate text-[11.5px] text-text-3">{o.endTime ? `${time}–${o.endTime}` : time}</span>
                          </button>
                        </li>
                      );
                    }
                    if (b.workout) {
                      const w = b.workout;
                      return (
                        <li key={b.key} className="absolute" style={style}>
                          <button
                            type="button"
                            draggable
                            onDragStart={() => onDragStart({ workout: w })}
                            onDragEnd={onDragEnd}
                            onClick={() => onEditWorkout(w)}
                            className="flex size-full flex-col overflow-hidden rounded-[10px] border border-line-2 bg-bg px-2 py-1 text-left text-[13px] leading-snug hover:bg-surface-2"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={`min-w-0 truncate ${w.status === "done" ? "text-text-3 line-through" : ""}`}>{w.activity}</span>
                              <WorkoutMark />
                              <span className="sr-only">Allenamento</span>
                            </span>
                            <span className="truncate text-[11.5px] text-text-3">
                              {[time, w.duration_min ? formatDuration(w.duration_min) : null].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const t = b.task!;
                    const done = t.status === "done";
                    return (
                      <li key={b.key} className="absolute" style={style}>
                        <button
                          type="button"
                          draggable
                          onDragStart={() => onDragStart({ task: t })}
                          onDragEnd={onDragEnd}
                          onClick={() => onEdit({ kind: "task", task: t })}
                          className="flex size-full flex-col overflow-hidden rounded-[10px] border border-dashed border-line-2 bg-bg px-2 py-1 text-left text-[13px] leading-snug hover:bg-surface-2"
                        >
                          <span className={`min-w-0 truncate ${done ? "text-text-3 line-through" : ""}`}>{t.title}</span>
                          <span className="truncate text-[11.5px] text-text-3">
                            {[trimTime(t.time!), t.duration_min ? formatDuration(t.duration_min) : null].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Un'attività senza orario: si apre con un clic e si trascina su un altro giorno. */
export function TaskChip({
  task,
  area,
  meta,
  deadline = false,
  onDragStart,
  onDragEnd,
  onEdit,
}: {
  task: Task;
  area?: Area;
  meta?: string;
  /** Attività nel periodo mostrata nel suo ultimo giorno utile. */
  deadline?: boolean;
  onDragStart: (item: Dragged) => void;
  onDragEnd: () => void;
  onEdit: (target: EditorTarget) => void;
}) {
  const done = task.status === "done";
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart({ task })}
      onDragEnd={onDragEnd}
      onClick={() => onEdit({ kind: "task", task })}
      className={`${chipClass} border-dashed border-line-2`}
    >
      {deadline && !done ? (
        <Diamond label="Scadenza" />
      ) : (
        <span aria-hidden className="size-[9px] shrink-0 rounded-full border-[1.3px] border-text-3" />
      )}
      <span className={`min-w-0 break-words ${done ? "text-text-3 line-through" : deadline ? "text-gold" : ""}`}>{task.title}</span>
      <AreaDot area={area} />
      {done || deadline ? null : <AttentionMark level={task.attention} />}
      {meta ? <span className="ml-auto shrink-0 text-[11.5px] text-text-3">{meta}</span> : null}
    </button>
  );
}
