"use client";

import { AreaDot } from "@/components/today/task-row";
import { AttentionMark } from "@/components/ui/marks";
import type { Occurrence } from "@/lib/events/day";
import type { Area } from "@/lib/supabase/types";

/** Un evento nell'agenda: un blocco, senza casella di spunta. `past` lo attenua quando è già finito. */
export function EventBlock({ occurrence, area, past = false, onOpen }: { occurrence: Occurrence; area?: Area; past?: boolean; onOpen: () => void }) {
  const { event, allDay, startTime, endTime } = occurrence;
  const when = allDay ? "Tutto il giorno" : endTime ? `${startTime}–${endTime}` : startTime;
  return (
    <li className={past ? "opacity-50" : undefined}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-[15px] font-medium leading-snug">
          <AreaDot area={area} />
          <span className="min-w-0 flex-1 break-words">{event.title}</span>
          <AttentionMark level={event.attention} />
        </span>
        <span className={`text-xs text-text-3 ${area ? "pl-3.5" : ""}`}>{[when, area?.name, event.location].filter(Boolean).join(" · ")}</span>
      </button>
    </li>
  );
}
