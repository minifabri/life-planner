"use client";

import { Gift, Package, type LucideIcon } from "lucide-react";
import type { Occurrence } from "@/lib/events/day";
import { displayTitle, KIND_LABEL } from "@/lib/events/kind";
import type { EventKind } from "@/lib/supabase/types";

const KIND_ICON: Partial<Record<EventKind, LucideIcon>> = { birthday: Gift, shipment: Package };

export function KindIcon({ kind, size = 13 }: { kind: EventKind; size?: number }) {
  const Glyph = KIND_ICON[kind];
  return Glyph ? <Glyph size={size} strokeWidth={1.6} aria-hidden focusable={false} className="shrink-0" /> : null;
}

/**
 * Compleanni e spedizioni di un giorno: piccole voci grigie, fuori dall'agenda e dal carico della giornata.
 * Un tocco apre l'evento.
 */
export function QuietEvents({
  occurrences,
  onOpen,
  className = "",
}: {
  occurrences: Occurrence[];
  onOpen: (occurrence: Occurrence) => void;
  className?: string;
}) {
  if (!occurrences.length) return null;
  return (
    <ul aria-label="Compleanni e spedizioni" className={`-ml-2.5 flex flex-wrap items-center gap-x-1 ${className}`}>
      {occurrences.map((o) => (
        <li key={o.key} className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(o)}
            className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-left text-[13px] text-text-3 hover:bg-surface-2 hover:text-text-2"
          >
            <KindIcon kind={o.event.kind} />
            <span className="sr-only">{KIND_LABEL[o.event.kind]}: </span>
            <span className="min-w-0 break-words">{displayTitle(o.event)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
