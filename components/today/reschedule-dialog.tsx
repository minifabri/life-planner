"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { addDays, shortDate, type LocalDate } from "@/lib/dates/local";
import { quickDates } from "@/lib/tasks/actions";
import type { Task } from "@/lib/supabase/types";

/** Riprogramma (D30): date rapide, data a scelta, Scarta attività. */
export function RescheduleDialog({
  task,
  today,
  onMove,
  onDismiss,
  onClose,
}: {
  task: Task;
  today: LocalDate;
  onMove: (date: LocalDate) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(addDays(today, 2));
  return (
    <Sheet title="Riprogramma" isOpen onClose={onClose}>
      <p className="text-[17px] leading-snug">{task.title}</p>
      <div className="flex flex-col gap-2">
        {quickDates(today).map((q) => (
          <button
            key={q.date}
            type="button"
            onClick={() => onMove(q.date)}
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-2 px-4 text-[15px] hover:bg-surface-2"
          >
            <span>{q.label}</span>
            <span className="text-sm text-text-3">{shortDate(q.date)}</span>
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom) onMove(custom);
        }}
      >
        <Field label="Data a scelta" htmlFor="reschedule-date">
          <input
            id="reschedule-date"
            type="date"
            required
            min={today}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Button type="submit">Sposta</Button>
      </form>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <Button variant="quiet" onClick={onDismiss} className="self-start">
          Scarta attività
        </Button>
        <p className="text-xs text-text-3">Non la farai: esce da Today ma resta nello storico.</p>
      </div>
    </Sheet>
  );
}
