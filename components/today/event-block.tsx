"use client";

import { AreaDot } from "@/components/today/task-row";
import type { Occurrence } from "@/lib/events/day";
import type { Area } from "@/lib/supabase/types";

/** Un evento nell'agenda: un blocco, senza casella di spunta. */
export function EventBlock({ occurrence, area, onOpen }: { occurrence: Occurrence; area?: Area; onOpen: () => void }) {
  const { event, allDay, startTime, endTime } = occurrence;
  const when = allDay ? "Tutto il giorno" : endTime ? `${startTime}–${endTime}` : startTime;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-[15px] leading-snug">
          <span className="min-w-0 break-words">{event.title}</span>
          <AreaDot area={area} />
          {event.attention === "high" ? (
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold">Importante</span>
          ) : null}
        </span>
        <span className="text-xs text-text-3">{[when, event.location].filter(Boolean).join(" · ")}</span>
      </button>
    </li>
  );
}
