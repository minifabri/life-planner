"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { relativeDay, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";
import type { Template } from "@/lib/supabase/types";
import { applyTemplate } from "@/lib/templates/apply";

function dayLabel(date: LocalDate, today: LocalDate): string {
  const relative = relativeDay(date, today);
  // "oggi", "domani" e i giorni della settimana parlano da soli; più in là serve anche il giorno.
  const text = relative === shortDate(date) ? `${weekdayName(date)} ${relative}` : relative;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Scelta del giorno di partenza, con l'anteprima delle attività che nasceranno. */
export function ApplySheet({
  template,
  today,
  onApply,
  onClose,
}: {
  template: Template;
  today: LocalDate;
  onApply: (start: LocalDate) => Promise<void>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(today);
  const [busy, setBusy] = useState(false);
  const tasks = start ? applyTemplate(template.items, start) : [];

  return (
    <Sheet title={template.name} isOpen onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!start) return;
          setBusy(true);
          void onApply(start).finally(() => setBusy(false));
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Giorno di partenza" htmlFor="tpl-start">
          <input id="tpl-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <ul aria-label="Attività che verranno create" className="flex flex-col divide-y divide-line border-y border-line">
          {tasks.map((t, i) => (
            <li key={i} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-text-3">
                {dayLabel(t.date!, today)}
                {t.time ? ` · ${t.time}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy || tasks.length === 0}>
            {tasks.length === 1 ? "Crea 1 attività" : `Crea ${tasks.length} attività`}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
