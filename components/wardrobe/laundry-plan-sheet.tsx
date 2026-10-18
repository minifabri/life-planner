"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { addDays, dueLabel, relativeDay, type LocalDate } from "@/lib/dates/local";
import type { WashGroup } from "@/lib/supabase/types";
import { WASH_GROUP_OF } from "@/lib/wardrobe/laundry";
import { forecastFor, forecastText, type DayForecast } from "@/lib/weather/forecast";

const chip = (active: boolean) =>
  `flex min-h-11 items-center rounded-xl border px-3 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

/** Pianifica la lavatrice di un gruppo: diventa un'attività del giorno scelto, all'ora scelta se c'è. */
export function LaundryPlanSheet({
  group,
  count,
  today,
  deadline,
  days,
  onSave,
  onClose,
}: {
  group: WashGroup;
  count: number;
  today: LocalDate;
  /** Entro quando serve, se un capo è in programma. */
  deadline: LocalDate | null;
  days: DayForecast[] | null;
  onSave: (date: LocalDate, time: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const [date, setDate] = useState<LocalDate>(deadline && deadline > today ? deadline : today);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quick = [today, addDays(today, 1), addDays(today, 2)];
  const forecast = forecastFor(days, date);
  const late = deadline !== null && date > deadline;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setBusy(true);
    setError(null);
    if (!(await onSave(date, time || null))) {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
    }
  }

  return (
    <Sheet title={`Lavatrice ${WASH_GROUP_OF[group]}`} isOpen onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-text-2">
          {count === 1 ? "1 capo da lavare" : `${count} capi da lavare`}
          {deadline ? `, ${dueLabel(deadline, today)}` : ""}. Diventa un&apos;attività: quando la completi, scegli i capi che tornano puliti.
        </p>

        <div role="group" aria-label="Giorno" className="flex flex-wrap gap-1.5">
          {quick.map((d) => (
            <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)} className={`${chip(date === d)} capitalize`}>
              {relativeDay(d, today)}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Field label="Giorno" htmlFor="laundry-date">
            <input id="laundry-date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ora (facoltativa)" htmlFor="laundry-time">
            <input id="laundry-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {forecast || late ? (
          <p aria-live="polite" className="-mt-2 text-xs text-text-2">
            {forecast ? `${relativeDay(date, today)[0].toUpperCase()}${relativeDay(date, today).slice(1)}: ${forecastText(forecast)}.` : ""}
            {late ? ` Dopo il giorno in cui serve il capo.` : ""}
          </p>
        ) : null}

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
