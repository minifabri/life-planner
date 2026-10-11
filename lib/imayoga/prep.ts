import { addDays, shortDate, weekdayName, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import type { Task } from "../supabase/types";
import { byId, type Op } from "../sync/ops";
import { IMAYOGA_TZ, type LessonDetails, type LocalLesson, type WantedLesson } from "./map";

/**
 * Preparazione di una lezione di imayoga: un'attività collegata all'evento, come quella dei pasti.
 * La lezione è "da preparare" finché l'attività esiste, "preparata" quando è completata.
 * L'id dell'attività deriva da quello della lezione: due dispositivi non ne creano due.
 */

export function prepTaskKey(eventId: string): string {
  return `lesson-prep:${eventId}`;
}

export function prepTitle(lessonTitle: string): string {
  return `Preparare la lezione: ${lessonTitle}`;
}

/** Giorno della lezione, nel fuso di imayoga. */
export function lessonDate(startAt: string): LocalDate {
  return localDateString(new Date(startAt), IMAYOGA_TZ);
}

/** "martedì 13 ott, 18:30": quando si tiene la lezione, mostrato accanto all'attività. */
export function prepNotes(startAt: string): string {
  const date = lessonDate(startAt);
  const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: IMAYOGA_TZ }).format(new Date(startAt));
  return `${weekdayName(date)} ${shortDate(date)}, ${time}`;
}

/** Il giorno in cui preparare: quello prima della lezione, oppure oggi se la lezione è oggi. Nessuno se è già passata. */
export function prepDate(lesson: LocalDate, today: LocalDate): LocalDate | null {
  if (lesson < today) return null;
  const day = addDays(lesson, -1);
  return day >= today ? day : today;
}

type Lesson = { id: string; title: string; start_at: string | null; area_id: string | null };

/** Segna la lezione come da preparare. Rifarlo dopo aver tolto l'attività la riporta com'era appena creata. */
export function addPrepOps(lesson: Lesson, taskId: string, today: LocalDate): Op[] {
  if (!lesson.start_at) return [];
  const date = prepDate(lessonDate(lesson.start_at), today);
  if (!date) return [];
  return [
    {
      kind: "insert",
      table: "tasks",
      merge: true,
      row: {
        id: taskId,
        title: prepTitle(lesson.title),
        notes: prepNotes(lesson.start_at),
        date,
        area_id: lesson.area_id,
        source: "lesson",
        event_id: lesson.id,
        status: "open",
        completed_at: null,
        deleted_at: null,
      },
    },
  ];
}

export function removePrepOps(taskId: string, now: string): Op[] {
  return [{ kind: "update", table: "tasks", patch: { deleted_at: now }, where: byId(taskId) }];
}

export type PrepState = "none" | "to_prep" | "prepared";

export function prepState(task: Pick<Task, "status" | "deleted_at"> | null | undefined): PrepState {
  if (!task || task.deleted_at) return "none";
  return task.status === "done" ? "prepared" : "to_prep";
}

export type PrepTask = Pick<Task, "id" | "event_id" | "title" | "notes" | "date">;

export type PrepFollowUp = {
  /** Attività da togliere: la lezione non c'è più. */
  remove: string[];
  /** Attività da riallineare: la lezione ha cambiato giorno, ora o nome. */
  update: { id: string; patch: Partial<Pick<Task, "title" | "notes" | "date">> }[];
};

/**
 * Dopo una sync: cosa fare delle preparazioni ancora aperte.
 * Il giorno dell'attività si ricalcola solo se la lezione ha cambiato giorno, così uno spostamento fatto a mano resta.
 */
export function followLessons(
  tasks: PrepTask[],
  local: LocalLesson[],
  updated: WantedLesson[],
  removed: string[],
  today: LocalDate,
): PrepFollowUp {
  const before = new Map(local.map((l) => [l.id, l]));
  const after = new Map(updated.map((w) => [w.id, w]));
  const gone = new Set(removed);
  const out: PrepFollowUp = { remove: [], update: [] };
  for (const task of tasks) {
    if (!task.event_id) continue;
    if (gone.has(task.event_id)) {
      out.remove.push(task.id);
      continue;
    }
    const lesson = after.get(task.event_id);
    if (!lesson) continue;
    const patch: PrepFollowUp["update"][number]["patch"] = {};
    const title = prepTitle(lesson.title);
    const notes = prepNotes(lesson.start_at);
    if (task.title !== title) patch.title = title;
    if (task.notes !== notes) patch.notes = notes;
    const old = before.get(lesson.id)?.start_at;
    const day = lessonDate(lesson.start_at);
    if (old && lessonDate(old) !== day) {
      const date = prepDate(day, today);
      if (date && date !== task.date) patch.date = date;
    }
    if (Object.keys(patch).length) out.update.push({ id: task.id, patch });
  }
  return out;
}

/** Prenotati sui posti disponibili: "3 di 8", oppure solo "3" se la lezione non ha un limite. */
export function bookedSummary(lesson: LessonDetails): string {
  return lesson.capacity ? `${lesson.booked.length} di ${lesson.capacity}` : String(lesson.booked.length);
}
