"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import {
  cancelOccurrence,
  createEvent,
  createTask,
  saveTask,
  stopRecurrence,
  updateEvent,
  type EventInput,
  type RepeatInput,
  type TaskInput,
} from "@/lib/data/api";
import { useAreas, useInvalidateDay, useRecurrences } from "@/lib/data/hooks";
import {
  addDays,
  atLocalTime,
  endOfMonth,
  endOfWeek,
  isoWeekday,
  localTimeString,
  trimTime,
  type LocalDate,
} from "@/lib/dates/local";
import { localDateString } from "@/lib/dates/today";
import type { Occurrence } from "@/lib/events/day";
import {
  DAY_FULL,
  DAY_SHORT,
  describeAfterCompletion,
  describeRRule,
  parseRRule,
  toRRule,
} from "@/lib/recurrence/rule";
import type { Attention, Task } from "@/lib/supabase/types";

/** Valori iniziali di un nuovo elemento, ad esempio quelli letti dal Quick Capture. */
export type EditorDraft = Partial<{
  type: "task" | "event";
  title: string;
  attention: Attention;
  when: When;
  date: LocalDate;
  time: string;
  duration: string;
  due: LocalDate;
  repeat: Repeat;
  weekDays: number[];
  allDay: boolean;
  startTime: string;
  endTime: string;
}>;

export type EditorTarget =
  | { kind: "new"; day: LocalDate; draft?: EditorDraft }
  | { kind: "task"; task: Task }
  | { kind: "event"; occurrence: Occurrence };

type When = "day" | "window" | "none";
type Repeat = "none" | "daily" | "weekly" | "monthly" | "after";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

function initialState(target: EditorTarget, today: LocalDate) {
  const base = {
    type: "task" as "task" | "event",
    title: "",
    notes: "",
    areaId: "",
    attention: "low" as Attention,
    when: "day" as When,
    date: today,
    time: "",
    duration: "",
    due: endOfWeek(today),
    repeat: "none" as Repeat,
    weekDays: [isoWeekday(today)],
    intervalDays: "30",
    allDay: false,
    startTime: "09:00",
    endTime: "10:00",
    location: "",
  };

  if (target.kind === "new") {
    return { ...base, date: target.day, weekDays: [isoWeekday(target.day)], ...target.draft };
  }

  if (target.kind === "task") {
    const t = target.task;
    return {
      ...base,
      title: t.title,
      notes: t.notes ?? "",
      areaId: t.area_id ?? "",
      attention: t.attention,
      when: (t.date ? "day" : t.due_date ? "window" : "none") as When,
      date: t.date ?? today,
      time: t.time ? trimTime(t.time) : "",
      duration: t.duration_min ? String(t.duration_min) : "",
      due: t.due_date ?? base.due,
      weekDays: [isoWeekday(t.date ?? today)],
    };
  }

  const e = target.occurrence.event;
  const rule = e.rrule ? parseRRule(e.rrule) : null;
  const start = e.start_at ? new Date(e.start_at) : null;
  const date = e.all_day ? (e.start_date ?? today) : start ? localDateString(start, e.tz) : today;
  return {
    ...base,
    type: "event" as const,
    title: e.title,
    notes: e.notes ?? "",
    areaId: e.area_id ?? "",
    attention: e.attention,
    date,
    allDay: e.all_day,
    startTime: start ? localTimeString(start, e.tz) : base.startTime,
    endTime: e.end_at ? localTimeString(new Date(e.end_at), e.tz) : "",
    location: e.location ?? "",
    repeat: (rule ? rule.freq : "none") as Repeat,
    weekDays: rule?.byDay ?? [isoWeekday(date)],
  };
}

export function ItemEditor({
  target,
  today,
  tz,
  onClose,
  onDeleteTask,
}: {
  target: EditorTarget;
  today: LocalDate;
  tz: string;
  onClose: () => void;
  onDeleteTask: (task: Task) => void;
}) {
  const [f, setF] = useState(() => initialState(target, today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const areas = useAreas().data ?? [];
  const invalidate = useInvalidateDay();

  const task = target.kind === "task" ? target.task : null;
  const occurrence = target.kind === "event" ? target.occurrence : null;
  const event = occurrence?.event ?? null;
  const readOnly = event?.source === "gcal" || event?.source === "icloud";
  // Una serie con una regola che l'interfaccia non sa mostrare si lascia com'è.
  const lockedRule = event?.rrule && !parseRRule(event.rrule) ? event.rrule : null;

  const recurrences = useRecurrences().data;
  const recurrence = task?.recurrence_id ? recurrences?.find((r) => r.id === task.recurrence_id) : undefined;

  function set<K extends keyof typeof f>(key: K, value: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function fixedRule(): string {
    if (f.repeat === "weekly") {
      return toRRule({ freq: "weekly", interval: 1, byDay: f.weekDays.length ? f.weekDays : [isoWeekday(f.date)] });
    }
    return toRRule({ freq: f.repeat as "daily" | "monthly", interval: 1 });
  }

  function taskRepeat(): RepeatInput {
    if (f.when !== "day" || f.repeat === "none") return { kind: "none" };
    if (f.repeat === "after") return { kind: "after_completion", intervalDays: Math.max(1, Number(f.intervalDays) || 1) };
    return { kind: "fixed", rrule: fixedRule() };
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      invalidate();
      onClose();
    } catch {
      setError("Non è stato possibile salvare. Riprova.");
      setBusy(false);
    }
  }

  function save() {
    const title = f.title.trim();
    if (!title) {
      setError("Scrivi un titolo.");
      return;
    }
    const common = { title, notes: f.notes.trim() || null, area_id: f.areaId || null, attention: f.attention };

    if (f.type === "task") {
      const input: TaskInput = {
        ...common,
        date: f.when === "day" ? f.date : null,
        time: f.when === "day" && f.time ? f.time : null,
        duration_min: f.duration ? Number(f.duration) : null,
        due_date: f.when === "window" ? f.due : f.when === "day" ? (task?.due_date ?? null) : null,
        window_start: f.when === "window" ? (task?.window_start ?? today) : f.when === "day" ? (task?.window_start ?? null) : null,
      };
      run(async () => {
        if (!task) return createTask(input, taskRepeat(), today);
        await saveTask(task, input, taskRepeat(), today);
      });
      return;
    }

    const etz = event?.tz ?? tz;
    const startAt = f.allDay ? null : atLocalTime(f.date, f.startTime || "09:00", etz);
    const endAt =
      f.allDay || !f.endTime
        ? null
        : atLocalTime(f.endTime > (f.startTime || "09:00") ? f.date : addDays(f.date, 1), f.endTime, etz);
    const input: EventInput = {
      ...common,
      location: f.location.trim() || null,
      all_day: f.allDay,
      start_date: f.allDay ? f.date : null,
      end_date: null,
      start_at: startAt?.toISOString() ?? null,
      end_at: endAt?.toISOString() ?? null,
      tz: etz,
      rrule: lockedRule ?? (f.repeat === "none" || f.repeat === "after" ? null : fixedRule()),
    };
    run(() => (event ? updateEvent(event, input) : createEvent(input)));
  }

  const heading = readOnly
    ? "Evento"
    : target.kind === "new"
      ? "Aggiungi"
      : f.type === "task"
        ? "Modifica attività"
        : "Modifica evento";

  if (readOnly && event) {
    return (
      <Sheet title={heading} isOpen onClose={onClose}>
        <p className="text-[17px] leading-snug">{event.title}</p>
        {event.location ? <p className="text-sm text-text-2">{event.location}</p> : null}
        {event.notes ? <p className="whitespace-pre-wrap text-sm text-text-2">{event.notes}</p> : null}
        <p className="text-xs text-text-3">
          {event.source === "icloud"
            ? "Questo evento arriva dal calendario dell’iPhone (iCloud) e si modifica lì."
            : "Questo evento arriva da Google Calendar e si modifica lì."}
        </p>
      </Sheet>
    );
  }

  const repeatOptions: { value: Repeat; label: string }[] = [
    { value: "none", label: "Non si ripete" },
    { value: "daily", label: "Ogni giorno" },
    { value: "weekly", label: "Ogni settimana" },
    { value: "monthly", label: "Ogni mese" },
    ...(f.type === "task" ? [{ value: "after" as const, label: "Dopo il completamento" }] : []),
  ];
  const canChooseRepeat = f.type === "event" ? !lockedRule : f.when === "day" && !task?.recurrence_id;

  return (
    <Sheet title={heading} isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {target.kind === "new" ? (
          <Segmented
            label="Tipo"
            value={f.type}
            onChange={(v) => setF((prev) => ({ ...prev, type: v, repeat: "none" }))}
            options={[
              { value: "task", label: "Attività" },
              { value: "event", label: "Evento" },
            ]}
          />
        ) : null}

        <Field label="Titolo" htmlFor="item-title">
          <input
            id="item-title"
            autoFocus={target.kind === "new"}
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={f.type === "task" ? "Cosa c’è da fare?" : "Cosa succede?"}
            autoComplete="off"
            enterKeyHint="done"
            className={inputClass}
          />
        </Field>

        {f.type === "task" ? (
          <>
            <Segmented
              label="Quando"
              value={f.when}
              onChange={(v) => set("when", v)}
              options={[
                { value: "day", label: "Un giorno" },
                { value: "window", label: "Nel periodo" },
                { value: "none", label: "Senza data" },
              ]}
            />
            {f.when === "day" ? (
              <div className="flex gap-3">
                <Field label="Giorno" htmlFor="item-date">
                  <input id="item-date" type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Ora (facoltativa)" htmlFor="item-time">
                  <input id="item-time" type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={inputClass} />
                </Field>
              </div>
            ) : null}
            {f.when === "window" ? (
              <div className="flex flex-col gap-2">
                <Field label="Entro" htmlFor="item-due">
                  <input id="item-due" type="date" required min={today} value={f.due} onChange={(e) => set("due", e.target.value)} className={inputClass} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => set("due", endOfWeek(today))}>Entro domenica</Button>
                  <Button onClick={() => set("due", endOfMonth(today))}>Entro fine mese</Button>
                </div>
              </div>
            ) : null}
            {f.when === "none" ? (
              <p className="text-xs text-text-3">Senza data non compare in Today: la ritroverai nella ricerca.</p>
            ) : null}
          </>
        ) : (
          <>
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} className="size-5 accent-(--accent-fill)" />
              Tutto il giorno
            </label>
            <Field label={event?.rrule ? "Primo giorno" : "Giorno"} htmlFor="item-date">
              <input id="item-date" type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
            </Field>
            {!f.allDay ? (
              <div className="flex gap-3">
                <Field label="Inizio" htmlFor="item-start">
                  <input id="item-start" type="time" required value={f.startTime} onChange={(e) => set("startTime", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Fine (facoltativa)" htmlFor="item-end">
                  <input id="item-end" type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} className={inputClass} />
                </Field>
              </div>
            ) : null}
            <Field label="Luogo" htmlFor="item-location">
              <input id="item-location" value={f.location} onChange={(e) => set("location", e.target.value)} autoComplete="off" className={inputClass} />
            </Field>
          </>
        )}

        <details className="group flex flex-col" open={target.kind !== "new"}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-text-2 [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" size={15} className="transition-transform group-open:rotate-90" />
            Altri dettagli
          </summary>
          <div className="flex flex-col gap-4 pt-1">
            {f.type === "task" ? (
              <Field label="Durata" htmlFor="item-duration">
                <select id="item-duration" value={f.duration} onChange={(e) => set("duration", e.target.value)} className={inputClass}>
                  <option value="">Nessuna</option>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d < 60 ? `${d} minuti` : d === 60 ? "1 ora" : `${d / 60} ore`.replace(".", ",")}
                    </option>
                  ))}
                  {f.duration && !DURATIONS.includes(Number(f.duration)) ? <option value={f.duration}>{f.duration} minuti</option> : null}
                </select>
              </Field>
            ) : null}

            {task?.recurrence_id ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-text-2">Ripetizione</span>
                <p className="text-sm">
                  {!recurrence
                    ? "Si ripete"
                    : !recurrence.active
                      ? "Ripetizione interrotta"
                      : recurrence.kind === "fixed" && recurrence.rrule
                        ? describeRRule(recurrence.rrule)
                        : describeAfterCompletion(recurrence.interval_days ?? 1)}
                </p>
                {recurrence?.active ? (
                  <Button
                    disabled={busy}
                    onClick={() => run(() => stopRecurrence(recurrence.id, today))}
                    className="self-start"
                  >
                    Interrompi ripetizione
                  </Button>
                ) : null}
                <p className="text-xs text-text-3">Le modifiche valgono solo per questa attività.</p>
              </div>
            ) : lockedRule ? (
              <p className="text-sm text-text-2">{describeRRule(lockedRule)}</p>
            ) : canChooseRepeat ? (
              <div className="flex flex-col gap-3">
                <Field label="Ripeti" htmlFor="item-repeat">
                  <select id="item-repeat" value={f.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)} className={inputClass}>
                    {repeatOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {f.repeat === "weekly" ? (
                  <div role="group" aria-label="Giorni della settimana" className="flex gap-1">
                    {DAY_SHORT.map((short, i) => {
                      const day = i + 1;
                      const on = f.weekDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_FULL[i]}
                          onClick={() => set("weekDays", on ? f.weekDays.filter((d) => d !== day) : [...f.weekDays, day])}
                          className={`min-h-11 flex-1 rounded-xl border text-sm ${
                            on ? "border-accent bg-accent-soft text-text" : "border-line-2 text-text-2"
                          }`}
                        >
                          {short}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {f.repeat === "after" ? (
                  <Field label="Giorni dopo l’ultima volta" htmlFor="item-interval">
                    <input
                      id="item-interval"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={730}
                      required
                      value={f.intervalDays}
                      onChange={(e) => set("intervalDays", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-2">Attenzione</span>
              <Segmented
                label="Attenzione"
                value={f.attention}
                onChange={(v) => set("attention", v)}
                options={[
                  { value: "low", label: "Bassa" },
                  { value: "medium", label: "Media" },
                  { value: "high", label: "Alta" },
                ]}
              />
            </div>

            {areas.length ? (
              <Field label="Area" htmlFor="item-area">
                <select id="item-area" value={f.areaId} onChange={(e) => set("areaId", e.target.value)} className={inputClass}>
                  <option value="">Nessuna</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Note" htmlFor="item-notes">
              <textarea id="item-notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} py-2.5`} />
            </Field>
          </div>
        </details>

        {error ? (
          <p role="alert" className="text-sm text-gold">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {target.kind === "new" ? "Aggiungi" : "Salva"}
        </Button>
      </form>

      {target.kind !== "new" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {!confirmDelete ? (
            <Button variant="quiet" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Elimina
            </Button>
          ) : task ? (
            <>
              <Button
                disabled={busy}
                onClick={() => {
                  onDeleteTask(task);
                  onClose();
                }}
              >
                Conferma eliminazione
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
            </>
          ) : event && occurrence ? (
            <>
              {event.rrule ? (
                <Button disabled={busy} onClick={() => run(() => cancelOccurrence(event.id, occurrence.originalStart))}>
                  Solo questo giorno
                </Button>
              ) : null}
              <Button disabled={busy} onClick={() => run(() => updateEvent(event, { deleted_at: new Date().toISOString() }))}>
                {event.rrule ? "Tutta la serie" : "Conferma eliminazione"}
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
