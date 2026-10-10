import { addDays, diffDays, dueLabel, type LocalDate } from "../dates/local";
import { DEFAULT_TZ, localDateString } from "../dates/today";
import type { Task } from "../supabase/types";

export type TaskSection = "overdue" | "agenda" | "todo" | "window";

type Classifiable = Pick<
  Task,
  "date" | "time" | "due_date" | "window_start" | "status" | "completed_at" | "created_at" | "deleted_at"
>;

/** Inizio della finestra: quello salvato, altrimenti il giorno di creazione. */
export function windowStartOf(task: Pick<Task, "window_start" | "created_at">, tz: string = DEFAULT_TZ): LocalDate {
  return task.window_start ?? localDateString(new Date(task.created_at), tz);
}

/** Giorni di anticipo della promozione (D32): 1 per finestre fino a 7 giorni, 3 per le più lunghe. */
export function promotionLead(windowStart: LocalDate, due: LocalDate): 1 | 3 {
  return diffDays(due, windowStart) <= 7 ? 1 : 3;
}

/** Un'attività nel periodo è promossa in "Da fare oggi" negli ultimi giorni della finestra. */
export function isPromoted(
  task: Pick<Task, "date" | "due_date" | "window_start" | "created_at">,
  today: LocalDate,
  tz: string = DEFAULT_TZ,
): boolean {
  if (task.date || !task.due_date || task.due_date < today) return false;
  const lead = promotionLead(windowStartOf(task, tz), task.due_date);
  return today >= addDays(task.due_date, -lead);
}

/**
 * Sezione di Today in cui compare un'attività per il giorno `day`, o null se non compare.
 * "Rimaste indietro" e "Nel periodo" esistono solo quando `day` è oggi.
 */
export function classifyTask(
  task: Classifiable,
  day: LocalDate,
  today: LocalDate,
  tz: string = DEFAULT_TZ,
): TaskSection | null {
  if (task.deleted_at || task.status === "dismissed") return null;

  if (task.status === "done") {
    if (task.date === day) return task.time ? "agenda" : "todo";
    // Completata in questo giorno pur essendo di un altro (es. recuperata da "Rimaste indietro").
    if (task.completed_at && localDateString(new Date(task.completed_at), tz) === day) return "todo";
    return null;
  }

  if (task.date) {
    if (task.date === day) return task.time ? "agenda" : "todo";
    if (task.date < today && day === today) return "overdue";
    return null;
  }

  if (task.due_date) {
    if (task.due_date < today) return day === today ? "overdue" : null;
    if (day === today) return isPromoted(task, today, tz) ? "todo" : "window";
    // Nei giorni futuri la si vede solo nell'ultimo giorno utile.
    return day > today && day === task.due_date ? "todo" : null;
  }

  return null;
}

/** Il giorno da cui un'attività è rimasta indietro. */
export function overdueSince(task: Pick<Task, "original_date" | "date" | "due_date">): LocalDate | null {
  return task.original_date ?? task.date ?? task.due_date;
}

export type DaySections<T> = Record<TaskSection, T[]>;

const ATTENTION_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function groupTasks<T extends Classifiable & Pick<Task, "attention" | "original_date">>(
  tasks: T[],
  day: LocalDate,
  today: LocalDate,
  tz: string = DEFAULT_TZ,
): DaySections<T> {
  const out: DaySections<T> = { overdue: [], agenda: [], todo: [], window: [] };
  for (const t of tasks) {
    const section = classifyTask(t, day, today, tz);
    if (section) out[section].push(t);
  }
  out.overdue.sort((a, b) => (overdueSince(a) ?? "").localeCompare(overdueSince(b) ?? ""));
  out.agenda.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  out.todo.sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention] ||
      a.created_at.localeCompare(b.created_at),
  );
  out.window.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  return out;
}

/** "4 da fare nel periodo · 2 entro domenica · 2 entro fine mese" */
export function windowSummary(tasks: Pick<Task, "due_date">[], today: LocalDate): string {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const label = dueLabel(t.due_date, today);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const head = `${tasks.length} da fare nel periodo`;
  if (counts.size === 1) return `${head} · ${[...counts.keys()][0]}`;
  return [head, ...[...counts].map(([label, n]) => `${n} ${label}`)].join(" · ");
}
