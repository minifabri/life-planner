import { addDays, relativeDay, type LocalDate } from "../dates/local";
import type { Task } from "../supabase/types";

/** Ora della Evening review quando il profilo non è ancora arrivato (come il default della tabella). */
export const DEFAULT_EVENING_TIME = "20:30";

export type OverviewMode = "morning" | "evening";

/** Quale card mostrare in cima a Today: la panoramica fino all'ora della review, poi la review (Product Definition 7.8). */
export function overviewMode(nowTime: string, eveningTime: string = DEFAULT_EVENING_TIME): OverviewMode {
  return nowTime >= eveningTime.slice(0, 5) ? "evening" : "morning";
}

export function greeting(nowTime: string, eveningTime: string = DEFAULT_EVENING_TIME): string {
  if (overviewMode(nowTime, eveningTime) === "evening") return "Buonasera";
  return nowTime < "13:00" ? "Buongiorno" : "Buon pomeriggio";
}

function salute(word: string, name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `${word}, ${n}.` : `${word}.`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Deadline = Pick<Task, "title" | "due_date" | "date" | "status" | "attention" | "deleted_at">;

/** La scadenza più vicina nei prossimi sei giorni (oggi escluso); a parità di giorno vince l'attenzione più alta. */
export function nextDeadline<T extends Deadline>(tasks: T[], today: LocalDate): T | null {
  const last = addDays(today, 6);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const upcoming = tasks
    .filter((t) => t.status === "open" && !t.deleted_at && !t.date && t.due_date && t.due_date > today && t.due_date <= last)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || rank[a.attention] - rank[b.attention]);
  return upcoming[0] ?? null;
}

export type MorningInput = {
  name?: string | null;
  nowTime: string;
  eveningTime?: string;
  /** Appuntamenti di oggi. */
  events: number;
  /** Attività di oggi ancora aperte (Agenda e Da fare oggi). */
  openTasks: Pick<Task, "due_date">[];
  overdue: number;
  /** Etichetta del carico ("Giornata media"), vuota se la giornata è libera. */
  loadLabel?: string;
  /** Tutte le attività caricate: da qui si ricava la prossima scadenza. */
  allTasks: Deadline[];
  today: LocalDate;
};

/**
 * Morning overview: "Buongiorno, Bibi. Oggi 3 appuntamenti e 8 attività; una scade oggi."
 * e, a parte, la prossima scadenza ("Lunedì scade «Rinnovo assicurazione»").
 */
export function morningOverview(input: MorningInput): { text: string; note: string | null } {
  const { events, openTasks, overdue, today } = input;
  const parts = [
    events ? count(events, "appuntamento", "appuntamenti") : null,
    openTasks.length ? `${openTasks.length} attività` : null,
  ].filter(Boolean);

  let day = parts.length ? `Oggi ${parts.join(" e ")}` : "Oggi niente in programma";
  const dueToday = openTasks.filter((t) => t.due_date === today).length;
  if (dueToday) day += dueToday === 1 ? "; una scade oggi" : `; ${dueToday} scadono oggi`;

  const extra = [
    parts.length && input.loadLabel ? input.loadLabel : null,
    overdue ? count(overdue, "rimasta indietro", "rimaste indietro") : null,
  ].filter(Boolean) as string[];
  const tail = extra.length ? ` ${extra[0]}${extra.slice(1).map((e) => `, ${e}`).join("")}.` : "";

  const next = nextDeadline(input.allTasks, today);
  const when = next ? relativeDay(next.due_date!, today) : "";
  return {
    text: `${salute(greeting(input.nowTime, input.eveningTime), input.name)} ${day}.${tail}`,
    note: next ? `${when.charAt(0).toUpperCase()}${when.slice(1)} scade «${next.title}».` : null,
  };
}

/** Evening review: "Buonasera, Bibi. Restano 3 attività aperte." */
export function eveningHeading(name: string | null | undefined, open: number): string {
  const rest = open === 0 ? "Tutto fatto per oggi." : open === 1 ? "Resta un'attività aperta." : `Restano ${open} attività aperte.`;
  return `${salute("Buonasera", name)} ${rest}`;
}
