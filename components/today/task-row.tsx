"use client";

import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { AttentionMark } from "@/components/ui/marks";
import { formatDuration, trimTime } from "@/lib/dates/local";
import type { Area, Task } from "@/lib/supabase/types";
import { readTheme } from "@/lib/theme";

/** Colore dell'area nel tema attivo. */
export function areaColor(area: Area): string {
  return readTheme() === "light" ? area.color_light : area.color_dark;
}

/** Imposta `--area` per `.area-tint`: sfumatura e striscia dell'area sui blocchi degli eventi. */
export function areaTintStyle(area: Area | undefined): CSSProperties | undefined {
  return area ? ({ "--area": areaColor(area) } as CSSProperties) : undefined;
}

/** Punto da 6 px con il colore dell'area di vita. Con `fallback` resta un punto neutro anche senza area. */
export function AreaDot({ area, fallback = false }: { area: Area | undefined; fallback?: boolean }) {
  if (!area) return fallback ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-text-2" /> : null;
  return (
    <span
      title={area.name}
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: areaColor(area) }}
    >
      <span className="sr-only">Area: {area.name}</span>
    </span>
  );
}

export function TaskRow({
  task,
  area,
  meta,
  showTime = false,
  onToggle,
  onOpen,
  onRemove,
  actions,
}: {
  task: Task;
  area?: Area;
  /** Dettaglio accanto al titolo: scadenza, giorno di partenza. */
  meta?: string;
  showTime?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** Mostra una X per togliere l'attività senza aprirla (preparazioni dei pasti). */
  onRemove?: () => void;
  actions?: ReactNode;
}) {
  const done = task.status === "done";
  const details = [
    showTime && task.time ? trimTime(task.time) : null,
    task.duration_min ? formatDuration(task.duration_min) : null,
    area?.name,
    meta,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-1 border-b border-line last:border-b-0">
      <label className="-ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={done}
          onChange={onToggle}
          aria-label={done ? `Rimetti da fare: ${task.title}` : `Completa: ${task.title}`}
        />
        <span
          className={`flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-active:scale-[0.86] ${
            done ? "border-accent-fill bg-accent-fill text-on-accent" : "border-text-3 text-transparent"
          }`}
        >
          <Icon name="check" size={14} strokeWidth={2.2} />
        </span>
      </label>
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left">
        <span className={`min-w-0 break-words text-[15px] leading-snug ${done ? "text-text-3 line-through" : "text-text"}`}>{task.title}</span>
        {details.length ? <span className="text-xs text-text-3">{details.join(" · ")}</span> : null}
      </button>
      {task.is_private ? (
        <span className="shrink-0 text-text-3">
          <Icon name="lock" size={13} />
          <span className="sr-only">Riservata</span>
        </span>
      ) : null}
      {!done && task.remind && (task.date || task.due_date) ? (
        <span className="shrink-0 text-text-3">
          <Icon name="bell" size={14} />
          <span className="sr-only">Con promemoria</span>
        </span>
      ) : null}
      {done ? null : <AttentionMark level={task.attention} className="mx-1.5" />}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Elimina: ${task.title}`}
          className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-3 hover:bg-surface-2 hover:text-text"
        >
          <Icon name="close" size={15} />
        </button>
      ) : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  );
}

export function RowAction({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="min-h-11 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}
