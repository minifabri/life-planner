"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { useEvents, useTimezone } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/dates/local";
import { eventsForDay } from "@/lib/events/day";
import type { OutfitPlan, WardrobeItem } from "@/lib/supabase/types";

export type PlanChoice = Pick<OutfitPlan, "date" | "event_id" | "label">;

const chip = (active: boolean) =>
  `flex min-h-11 items-center rounded-xl border px-3 text-left text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

/** Pianifica un outfit: il giorno, e se vuoi l'evento di quel giorno o un'occasione scritta a mano. Non crea eventi. */
export function PlanSheet({
  items,
  today,
  initial,
  onSave,
  onClose,
}: {
  items: WardrobeItem[];
  today: LocalDate;
  /** La pianificazione che si sta cambiando, se c'è. */
  initial: PlanChoice | null;
  onSave: (choice: PlanChoice) => Promise<boolean>;
  onClose: () => void;
}) {
  const tz = useTimezone();
  const [date, setDate] = useState<LocalDate>(initial?.date ?? today);
  const [eventId, setEventId] = useState<string | null>(initial?.event_id ?? null);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsQuery = useEvents(date, tz);
  const occurrences = eventsQuery.data ? eventsForDay(eventsQuery.data.events, eventsQuery.data.exceptions, date, tz) : [];

  function pickEvent(id: string, title: string) {
    if (eventId === id) {
      setEventId(null);
      if (label === title) setLabel("");
    } else {
      setEventId(id);
      setLabel(title);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setBusy(true);
    setError(null);
    if (!(await onSave({ date, event_id: eventId, label: label.trim() || null }))) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title="Pianifica outfit" isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <ul aria-label="Capi dell'outfit" className="flex gap-1.5 overflow-x-auto">
          {items.map((item) => (
            <li key={item.id} className="size-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
              <WardrobePhoto item={item} />
            </li>
          ))}
        </ul>

        <Field label="Giorno" htmlFor="plan-date">
          <input
            id="plan-date"
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              // L'evento scelto appartiene al giorno di prima.
              if (eventId) {
                setEventId(null);
                setLabel("");
              }
            }}
            className={inputClass}
          />
        </Field>

        {occurrences.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-2">Per un evento di quel giorno (facoltativo)</span>
            <div role="group" aria-label="Evento" className="flex flex-col gap-1.5">
              {occurrences.map((o) => (
                <button key={o.key} type="button" aria-pressed={eventId === o.event.id} onClick={() => pickEvent(o.event.id, o.event.title)} className={chip(eventId === o.event.id)}>
                  <span className="line-clamp-1">
                    {o.startTime ? <span className="mr-2 font-mono text-xs text-text-3">{o.startTime}</span> : null}
                    {o.event.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="Occasione (facoltativa)" htmlFor="plan-label">
          <input id="plan-label" value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" placeholder="Es. Cena fuori" className={inputClass} />
        </Field>

        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || !date}>
            Pianifica
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
