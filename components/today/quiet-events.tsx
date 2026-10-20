"use client";

import {
  BedDouble,
  Bus,
  CalendarClock,
  Car,
  ConciergeBell,
  Gift,
  Hourglass,
  Package,
  Plane,
  Ship,
  Ticket,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import type { Occurrence } from "@/lib/events/day";
import { displayTitle, KIND_LABEL, travelMode, type TravelMode } from "@/lib/events/kind";
import type { EventKind } from "@/lib/supabase/types";

const KIND_ICON: Partial<Record<EventKind, LucideIcon>> = {
  birthday: Gift,
  shipment: Package,
  appointment: CalendarClock,
  stay: BedDouble,
  ticket: Ticket,
  reservation: ConciergeBell,
  deadline: Hourglass,
};

const TRAVEL_ICON: Record<TravelMode, LucideIcon> = { plane: Plane, train: TrainFront, bus: Bus, ship: Ship, car: Car };

/** L'icona del tipo di evento; per un viaggio quella del mezzo, letto dal titolo (`title`). */
export function KindIcon({ kind, title = "", size = 13 }: { kind: EventKind; title?: string; size?: number }) {
  const Glyph = kind === "travel" ? TRAVEL_ICON[travelMode(title)] : KIND_ICON[kind];
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
            <KindIcon kind={o.event.kind} title={o.event.title} />
            <span className="sr-only">{KIND_LABEL[o.event.kind]}: </span>
            <span className="min-w-0 break-words">{displayTitle(o.event)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
