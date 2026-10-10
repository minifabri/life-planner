import { addDays, atLocalTime, localTimeString, relativeDay, trimTime, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import { eventsForDay } from "../events/day";
import type { Attention, EventException, EventRow, Task } from "../supabase/types";
import { groupTasks } from "../tasks/classify";
import { eveningHeading, morningOverview } from "../today/overview";

/**
 * Calcolo delle notifiche (technical-design.md, 7.2; Product Definition 5.4).
 * Modulo puro: dato lo stato di attività ed eventi, dice quali notifiche scattano in un intervallo.
 * Lo usa la Edge Function `dispatch-reminders` a ogni giro, quindi non esistono promemoria
 * pianificati in anticipo da tenere allineati: ciò che è completato, spostato o eliminato non notifica.
 */

/** Preferenze del profilo che governano le notifiche. Gli orari sono "HH:mm" o "HH:mm:ss". */
export type ReminderSettings = {
  timezone: string;
  morning_overview_time: string;
  evening_review_time: string;
  quiet_start: string;
  quiet_end: string;
  meal_prep_reminder_time: string;
  notify_medium: boolean;
  notify_high: boolean;
  /** Le notifiche di attenzione alta arrivano anche nella fascia di silenzio. */
  quiet_allow_high: boolean;
  notify_meal_prep: boolean;
  notify_morning: boolean;
  notify_evening: boolean;
};

export type PlanTask = Pick<
  Task,
  | "id"
  | "title"
  | "notes"
  | "date"
  | "time"
  | "due_date"
  | "window_start"
  | "attention"
  | "status"
  | "completed_at"
  | "original_date"
  | "source"
  | "deleted_at"
  | "created_at"
  | "updated_at"
>;

export type PlanInput = {
  settings: ReminderSettings;
  /** Nome usato nel saluto della panoramica. */
  name?: string | null;
  tasks: PlanTask[];
  events: EventRow[];
  exceptions: EventException[];
};

export type PlannedReminder = {
  /** Identifica la notifica: la stessa chiave non viene inviata due volte. */
  key: string;
  targetType: "task" | "event" | "digest";
  targetId: string | null;
  fireAt: Date;
  title: string;
  body: string;
  url: string;
};

/** Vero se l'ora locale cade nella fascia di silenzio (che può attraversare la mezzanotte). */
export function inQuietHours(time: string, start: string, end: string): boolean {
  const [t, s, e] = [trimTime(time), trimTime(start), trimTime(end)];
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Sposta alla fine della fascia di silenzio un istante che ci cade dentro. */
export function afterQuietHours(instant: Date, settings: Pick<ReminderSettings, "timezone" | "quiet_start" | "quiet_end">): Date {
  const { timezone: tz, quiet_start, quiet_end } = settings;
  const time = localTimeString(instant, tz);
  if (!inQuietHours(time, quiet_start, quiet_end)) return instant;
  const day = localDateString(instant, tz);
  const end = trimTime(quiet_end);
  // Dalla sera alla mezzanotte la fascia finisce il giorno dopo.
  return atLocalTime(time >= end ? addDays(day, 1) : day, end, tz);
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function enabled(attention: Attention, s: ReminderSettings): boolean {
  return attention === "high" ? s.notify_high : attention === "medium" ? s.notify_medium : false;
}

/** Notifiche con orario di invio dopo `from` e fino a `to` compreso. */
export function planReminders(input: PlanInput, from: Date, to: Date): PlannedReminder[] {
  const { settings: s, tasks, events, exceptions } = input;
  const tz = s.timezone;
  const morning = trimTime(s.morning_overview_time);
  const evening = trimTime(s.evening_review_time);
  const out: PlannedReminder[] = [];

  /** Aggiunge la notifica se cade nell'intervallo e l'elemento non è stato toccato dopo l'orario previsto. */
  function add(
    r: Omit<PlannedReminder, "fireAt" | "body">,
    at: Date,
    bypassQuiet: boolean,
    updatedAt: string,
    /** Giorno dell'elemento e testo: "oggi" o "domani" si decidono all'invio, che il silenzio può spostare. */
    day: LocalDate,
    body: (when: string) => string,
  ) {
    const fireAt = bypassQuiet ? at : afterQuietHours(at, s);
    if (fireAt <= from || fireAt > to) return;
    // Creato o modificato a orario già passato: avvisare adesso sarebbe solo rumore.
    if (new Date(updatedAt) > fireAt) return;
    out.push({ ...r, fireAt, body: sentence(body(relativeDay(day, localDateString(fireAt, tz)))) });
  }

  // Il richiamo del giorno prima e la fascia di silenzio spostano l'invio di un giorno al massimo.
  const firstDay = addDays(localDateString(from, tz), -1);
  const lastDay = addDays(localDateString(to, tz), 1);

  for (const t of tasks) {
    if (t.deleted_at || t.status !== "open") continue;

    if (t.source === "meal") {
      if (!s.notify_meal_prep || !t.date) continue;
      add(
        { key: `task:${t.id}:meal:${t.date}`, targetType: "task", targetId: t.id, title: t.title, url: "/today" },
        atLocalTime(t.date, trimTime(s.meal_prep_reminder_time), tz),
        false,
        t.updated_at,
        t.date,
        () => t.notes ?? "",
      );
      continue;
    }

    if (!enabled(t.attention, s)) continue;
    const day = t.date ?? t.due_date;
    if (!day || day < firstDay || day > lastDay) continue;
    const time = t.date && t.time ? trimTime(t.time) : null;
    const bypass = t.attention === "high" && s.quiet_allow_high;
    const base = { targetType: "task" as const, targetId: t.id, title: t.title, url: "/today" };
    const stamp = `${day}${time ? `T${time}` : ""}`;

    const body = (when: string) => (time ? `${when} alle ${time}` : t.date ? `Da fare ${when}` : `Scade ${when}`);

    add({ ...base, key: `task:${t.id}:at:${stamp}` }, atLocalTime(day, time ?? morning, tz), bypass, t.updated_at, day, body);
    if (t.attention === "high") {
      add({ ...base, key: `task:${t.id}:before:${stamp}` }, atLocalTime(addDays(day, -1), time ?? evening, tz), bypass, t.updated_at, day, body);
    }
  }

  const noisy = events.filter((e) => !e.deleted_at && enabled(e.attention, s));
  if (noisy.length) {
    const seen = new Set<string>();
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      for (const o of eventsForDay(noisy, exceptions, day, tz)) {
        if (seen.has(o.key)) continue;
        seen.add(o.key);
        const e = o.event;
        const bypass = e.attention === "high" && s.quiet_allow_high;
        const base = { targetType: "event" as const, targetId: e.id, title: e.title, url: "/today" };

        if (o.allDay || !o.start) {
          const date = localDateString(o.originalStart, e.tz);
          const body = (when: string) => `${when}, tutto il giorno`;
          add({ ...base, key: `event:${e.id}:at:${date}` }, atLocalTime(date, morning, tz), bypass, e.updated_at, date, body);
          if (e.attention === "high") {
            add({ ...base, key: `event:${e.id}:before:${date}` }, atLocalTime(addDays(date, -1), evening, tz), bypass, e.updated_at, date, body);
          }
          continue;
        }

        const stamp = o.start.toISOString();
        const date = localDateString(o.start, tz);
        const time = localTimeString(o.start, tz);
        const body = (when: string) => `${when} alle ${time}${e.location ? ` · ${e.location}` : ""}`;
        add({ ...base, key: `event:${e.id}:at:${stamp}` }, o.start, bypass, e.updated_at, date, body);
        if (e.attention === "high") {
          // Stessa ora locale del giorno prima, anche a cavallo del cambio dell'ora.
          add({ ...base, key: `event:${e.id}:before:${stamp}` }, atLocalTime(addDays(date, -1), time, tz), bypass, e.updated_at, date, body);
        }
      }
    }
  }

  // Panoramica del mattino e revisione della sera (Product Definition 7.8): facoltative, spente in partenza.
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    if (s.notify_morning) {
      const fireAt = afterQuietHours(atLocalTime(day, morning, tz), s);
      if (fireAt > from && fireAt <= to) {
        const sections = groupTasks(tasks, day, day, tz);
        const overview = morningOverview({
          name: input.name,
          nowTime: morning,
          eveningTime: evening,
          events: eventsForDay(events, exceptions, day, tz).length,
          openTasks: [...sections.agenda, ...sections.todo].filter((t) => t.status === "open"),
          overdue: sections.overdue.length,
          allTasks: tasks,
          today: day,
        });
        out.push({
          key: `digest:morning:${day}`,
          targetType: "digest",
          targetId: null,
          fireAt,
          title: "La tua giornata",
          body: overview.note ? `${overview.text} ${overview.note}` : overview.text,
          url: "/today",
        });
      }
    }
    if (s.notify_evening) {
      const fireAt = afterQuietHours(atLocalTime(day, evening, tz), s);
      if (fireAt > from && fireAt <= to) {
        const sections = groupTasks(tasks, day, day, tz);
        const open = [...sections.agenda, ...sections.todo].filter((t) => t.status === "open").length;
        // Niente di aperto, niente notifica: la sera non serve un "tutto fatto".
        if (open > 0) {
          out.push({
            key: `digest:evening:${day}`,
            targetType: "digest",
            targetId: null,
            fireAt,
            title: "Revisione della sera",
            body: eveningHeading(input.name, open),
            url: "/today",
          });
        }
      }
    }
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
