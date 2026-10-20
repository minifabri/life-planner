import type { EventInput, RepeatInput, TaskInput } from "../data/api";
import { addDays, atLocalTime, dueLabel, formatDuration, isoWeekday, relativeDay, type LocalDate } from "../dates/local";
import type { CaptureKind, ParsedCapture } from "../parser/parse";
import { birthdayRule, kindFromTitle } from "../events/kind";
import { describeRule, toRRule, type SimpleRule } from "../recurrence/rule";
import type { WorkoutInput } from "../workouts/convert";

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
  | { kind: "workout"; input: WorkoutInput }
  | { kind: "shopping"; name: string }
  | { kind: "wishlist"; name: string; url: string | null }
  | { kind: "log"; entry: LogEntryInput };

export const KIND_LABEL: Record<CaptureKind, string> = {
  task: "Attività",
  event: "Evento",
  workout: "Allenamento",
  shopping: "Spesa",
  wishlist: "Wishlist",
  log: "Log",
};

/** Il compleanno letto dal parser vale finché resta un evento senza orario né ripetizione scelti dai chip. */
export function isBirthday(draft: Pick<CaptureDraft, "kind" | "birthday" | "time" | "repeat">): boolean {
  return draft.kind === "event" && draft.birthday && !draft.time && !draft.repeat;
}

/** Se un chip ha tolto il compleanno (orario, ripetizione, altro tipo) il titolo torna a dire di cosa si tratta. */
export function draftTitle(draft: Pick<CaptureDraft, "kind" | "birthday" | "time" | "repeat" | "title">): string {
  const title = draft.title.trim();
  return draft.birthday && !isBirthday(draft) ? `Compleanno ${title}` : title;
}

/** Una ripetizione settimanale senza giorni vale per il giorno della prima volta. */
function ruleFrom(repeat: SimpleRule, start: LocalDate): string {
  return toRRule(repeat.freq === "weekly" && !repeat.byDay?.length ? { ...repeat, byDay: [isoWeekday(start)] } : repeat);
}

/** Traduce la bozza nelle righe da scrivere. Funzione pura: le regole di coerenza tra i campi stanno qui. */
export function planCapture(draft: CaptureDraft, today: LocalDate, tz: string): CapturePlan {
  const title = draftTitle(draft);

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

  if (draft.kind === "workout") {
    // In un giorno già passato è un allenamento fatto: lo si sta annotando, non pianificando.
    const date = draft.date ?? today;
    const done = date < today;
    return {
      kind: "workout",
      input: {
        activity: title,
        date,
        time: draft.time,
        duration_min: draft.durationMin,
        notes: null,
        status: done ? "done" : "planned",
        completed_at: done ? atLocalTime(date, draft.time ?? "12:00", tz).toISOString() : null,
        distance_m: null,
        energy_kcal: null,
        avg_hr: null,
      },
    };
  }

  if (draft.kind === "event") {
    const date = draft.date ?? today;
    if (isBirthday(draft)) {
      // Come nel modulo completo: tutto il giorno, ogni anno, senza fine.
      return {
        kind: "event",
        input: {
          title,
          notes: null,
          location: null,
          all_day: true,
          start_date: date,
          end_date: null,
          start_at: null,
          end_at: null,
          tz,
          rrule: birthdayRule(date),
          area_id: null,
          attention: draft.attention,
          kind: "birthday",
        },
      };
    }
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
        // Dal titolo: "Dentista alle 15" è un appuntamento, "Volo per Parigi" un viaggio (D72).
        kind: kindFromTitle(title),
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
      // Senza giorno non c'è un momento in cui avvisare: come nel modulo completo, il flag si azzera.
      remind: draft.remind && (!!date || !!due),
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

/** Dove finisce ciò che si sta aggiungendo: il chip "In" del Quick Capture. */
export function destinationLabel(draft: Pick<CaptureDraft, "kind" | "date" | "windowEnd" | "time" | "repeat">, today: LocalDate): string {
  if (draft.kind === "shopping") return "Lista spesa";
  if (draft.kind === "wishlist") return "Wishlist";
  if (draft.kind === "log") return "Log";
  const day = draft.date ?? (draft.repeat || draft.time || draft.kind === "event" ? today : null);
  if (!day) return draft.windowEnd ? "Nel periodo" : "Senza data";
  const where = draft.kind === "event" || draft.time ? "Agenda" : "Da fare";
  return day === today ? `Oggi · ${where}` : where;
}

/** Un'attività con un giorno (o una scadenza): l'unica a cui un promemoria può arrivare. */
export function hasDay(draft: Pick<CaptureDraft, "date" | "windowEnd" | "time" | "repeat">): boolean {
  return !!(draft.date || draft.windowEnd || draft.time || draft.repeat);
}

/** Quando arriva la notifica del promemoria, come nel modulo completo. */
export function remindHint(draft: Pick<CaptureDraft, "date" | "windowEnd" | "time" | "repeat">): string {
  if (!hasDay(draft)) return "Per il promemoria serve un giorno: scegli quando.";
  if (!draft.date && !draft.time && !draft.repeat) return "Una notifica al mattino dell’ultimo giorno.";
  return draft.time ? `Una notifica alle ${draft.time}.` : "Una notifica al mattino. Con un’ora, arriva a quell’ora.";
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
    draft.repeat && draft.kind !== "workout" ? describeRule(draft.repeat).toLowerCase() : null,
    draft.kind === "task" && draft.remind && hasDay(draft) ? "promemoria" : null,
  ].filter(Boolean);
  if (isBirthday(draft)) return `Compleanno aggiunto · ${whenLabel(draft, today)} · ogni anno`;
  const head = draft.kind === "event" ? "Evento aggiunto" : draft.kind === "workout" ? "Allenamento aggiunto" : "Attività aggiunta";
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
