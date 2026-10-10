"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { formatDuration, trimTime } from "@/lib/dates/local";
import type { Area, Task } from "@/lib/supabase/types";
import { readTheme } from "@/lib/theme";

/** Punto da 6 px con il colore dell'area di vita. */
export function AreaDot({ area }: { area: Area | undefined }) {
  if (!area) return null;
  return (
    <span
      title={area.name}
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: readTheme() === "light" ? area.color_light : area.color_dark }}
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
  actions,
}: {
  task: Task;
  area?: Area;
  /** Dettaglio accanto al titolo: scadenza, giorno di partenza. */
  meta?: string;
  showTime?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  const done = task.status === "done";
  const details = [
    showTime && task.time ? trimTime(task.time) : null,
    task.duration_min ? formatDuration(task.duration_min) : null,
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
          className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
            done ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
          }`}
        >
          <Icon name="check" size={14} strokeWidth={2.2} />
        </span>
      </label>
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left">
        <span className={`flex items-center gap-2 text-[15px] leading-snug ${done ? "text-text-3 line-through" : "text-text"}`}>
          <span className="min-w-0 break-words">{task.title}</span>
          <AreaDot area={area} />
          {task.attention === "high" && !done ? (
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold">Importante</span>
          ) : null}
        </span>
        {details.length ? <span className="text-xs text-text-3">{details.join(" · ")}</span> : null}
      </button>
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
