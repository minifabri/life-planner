import type { EventInput, RepeatInput, TaskInput } from "../data/api";
import { addDays, atLocalTime, dueLabel, formatDuration, isoWeekday, relativeDay, type LocalDate } from "../dates/local";
import type { CaptureKind, ParsedCapture } from "../parser/parse";
import { describeRule, toRRule, type SimpleRule } from "../recurrence/rule";

/** Ciò che verrà salvato: l'interpretazione del parser con le correzioni fatte dai chip. */
export type CaptureDraft = Omit<ParsedCapture, "spans" | "confidence">;

export type LogEntryInput = {
  title: string;
  date: LocalDate;
  time: string | null;
  category_id: string | null;
  is_sensitive: boolean;
};

export type CapturePlan =
  | { kind: "task"; input: TaskInput; repeat: RepeatInput }
  | { kind: "event"; input: EventInput }
  | { kind: "shopping"; name: string }
  | { kind: "wishlist"; name: string; url: string | null }
  | { kind: "log"; entry: LogEntryInput };

export const KIND_LABEL: Record<CaptureKind, string> = {
  task: "Attività",
  event: "Evento",
  shopping: "Spesa",
  wishlist: "Wishlist",
  log: "Log",
};

/** Una ripetizione settimanale senza giorni vale per il giorno della prima volta. */
function ruleFrom(repeat: SimpleRule, start: LocalDate): string {
  return toRRule(repeat.freq === "weekly" && !repeat.byDay?.length ? { ...repeat, byDay: [isoWeekday(start)] } : repeat);
}

/** Traduce la bozza nelle righe da scrivere. Funzione pura: le regole di coerenza tra i campi stanno qui. */
export function planCapture(draft: CaptureDraft, today: LocalDate, tz: string): CapturePlan {
  const title = draft.title.trim();

  if (draft.kind === "shopping") return { kind: "shopping", name: title };
  if (draft.kind === "wishlist") return { kind: "wishlist", name: title, url: draft.url };

  if (draft.kind === "log") {
    return {
      kind: "log",
      entry: {
        title,
        date: draft.date ?? today,
        time: draft.time,
        category_id: draft.categoryId,
        is_sensitive: draft.sensitive,
      },
    };
  }

  if (draft.kind === "event") {
    const date = draft.date ?? today;
    const start = draft.time ? atLocalTime(date, draft.time, tz) : null;
    const end = start && draft.durationMin ? new Date(start.getTime() + draft.durationMin * 60_000) : null;
    return {
      kind: "event",
      input: {
        title,
        notes: null,
        location: null,
        all_day: !start,
        start_date: start ? null : date,
        end_date: null,
        start_at: start?.toISOString() ?? null,
        end_at: end?.toISOString() ?? null,
        tz,
        rrule: draft.repeat ? ruleFrom(draft.repeat, date) : null,
        area_id: null,
        attention: draft.attention,
      },
    };
  }

  // Attività: un orario o una ripetizione hanno bisogno di un giorno; la finestra vale solo senza ripetizione.
  const date = draft.date ?? (draft.time || draft.repeat ? today : null);
  const due = draft.repeat ? null : draft.windowEnd;
  return {
    kind: "task",
    input: {
      title,
      notes: null,
      date,
      time: date ? draft.time : null,
      duration_min: draft.durationMin,
      due_date: due,
      window_start: due ? today : null,
      attention: draft.attention,
      area_id: null,
    },
    repeat: draft.repeat ? { kind: "fixed", rrule: ruleFrom(draft.repeat, date ?? today) } : { kind: "none" },
  };
}

/** Etichetta del chip "quando": "domani", "entro domenica", "senza data". */
export function whenLabel(draft: Pick<CaptureDraft, "kind" | "date" | "windowEnd">, today: LocalDate): string {
  const parts = [];
  if (draft.date) parts.push(relativeDay(draft.date, today));
  if (draft.kind === "task" && draft.windowEnd) parts.push(dueLabel(draft.windowEnd, today));
  if (parts.length) return parts.join(" · ");
  return draft.kind === "task" ? "senza data" : "oggi";
}

/** Riassunto letto dagli screen reader e mostrato nel toast di conferma. */
export function describeDraft(draft: CaptureDraft, today: LocalDate): string {
  if (draft.kind === "shopping") return "Aggiunto alla spesa";
  if (draft.kind === "wishlist") return "Aggiunto alla wishlist";
  if (draft.kind === "log") return "Registrazione salvata";
  const details = [
    draft.date || draft.windowEnd ? whenLabel(draft, today) : null,
    draft.time,
    draft.durationMin ? formatDuration(draft.durationMin) : null,
    draft.repeat ? describeRule(draft.repeat).toLowerCase() : null,
  ].filter(Boolean);
  const head = draft.kind === "event" ? "Evento aggiunto" : "Attività aggiunta";
  return details.length ? `${head} · ${details.join(" · ")}` : head;
}

/** Date rapide del chip "quando": oggi e i sei giorni successivi (o precedenti, per le registrazioni). */
export function quickDays(today: LocalDate, past = false): { label: string; date: LocalDate }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, past ? -i : i);
    const label = relativeDay(date, today);
    return { label: label.charAt(0).toUpperCase() + label.slice(1), date };
  });
}
