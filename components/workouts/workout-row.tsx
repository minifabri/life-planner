"use client";

import type { ReactNode } from "react";
import { BicepsFlexed } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { formatDuration, trimTime, type LocalDate } from "@/lib/dates/local";
import type { Workout } from "@/lib/supabase/types";
import { formatDistance, shownStatus } from "@/lib/workouts/summary";

/** Il segno degli allenamenti nelle celle del Mese: un punto arancio. Il rombo resta solo alle scadenze e alle cose importanti. */
export function WorkoutMark({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`size-[5px] shrink-0 rounded-full bg-workout ${className}`} />;
}

/** Icona degli allenamenti nelle righe e nei blocchi: il muscolo, arancio (grigio se saltato), come il segno del giorno. */
export function WorkoutIcon({ size = 13, muted = false, className = "" }: { size?: number; muted?: boolean; className?: string }) {
  return <BicepsFlexed size={size} strokeWidth={1.8} aria-hidden focusable={false} className={`shrink-0 ${muted ? "text-text-3" : "text-workout"} ${className}`} />;
}

/** Orario, durata e misure di un allenamento, per la riga sotto il nome. */
export function workoutDetails(workout: Workout, today: LocalDate, showTime = true): string[] {
  return [
    showTime && workout.time ? trimTime(workout.time) : null,
    workout.duration_min ? formatDuration(workout.duration_min) : null,
    workout.distance_m ? formatDistance(workout.distance_m) : null,
    workout.energy_kcal ? `${workout.energy_kcal} kcal` : null,
    shownStatus(workout, today) === "skipped" ? "saltato" : null,
  ].filter((d): d is string => !!d);
}

export function WorkoutRow({
  workout,
  today,
  meta,
  onToggle,
  onOpen,
  actions,
}: {
  workout: Workout;
  today: LocalDate;
  /** Dettaglio in più, prima degli altri: ad esempio il giorno, nello storico. */
  meta?: string;
  onToggle: () => void;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  const done = workout.status === "done";
  const skipped = shownStatus(workout, today) === "skipped";
  const details = [meta, ...workoutDetails(workout, today)].filter(Boolean);

  return (
    <li className="flex items-center gap-1 border-b border-line last:border-b-0">
      <label className="-ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={done}
          onChange={onToggle}
          aria-label={done ? `Segna come non fatto: ${workout.activity}` : `Segna come fatto: ${workout.activity}`}
        />
        <span
          className={`flex size-[22px] items-center justify-center rounded-full border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
            done ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
          }`}
        >
          <Icon name="check" size={14} strokeWidth={2.2} />
        </span>
      </label>
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left">
        <span className={`flex items-center gap-2 text-[15px] leading-snug ${done || skipped ? "text-text-3" : "text-text"}`}>
          <WorkoutIcon muted={skipped} />
          <span className="min-w-0 break-words">{workout.activity}</span>
          <span className="sr-only">Allenamento</span>
        </span>
        {details.length ? <span className="text-xs text-text-3">{details.join(" · ")}</span> : null}
      </button>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  );
}
