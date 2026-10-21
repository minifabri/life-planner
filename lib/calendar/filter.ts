import type { Occurrence } from "../events/day";
import type { DayView } from "./view";

/**
 * Filtri del calendario (D75): cosa mostrare in Settimana, Mese e Lista.
 * Nessun filtro scelto vuol dire tutto; con uno o più filtri si vede solo ciò che vi appartiene.
 */
export type CalendarFilter = "event" | "appointment" | "travel" | "lesson" | "task" | "workout" | "shipment" | "birthday";

export const FILTERS: { id: CalendarFilter; label: string }[] = [
  { id: "event", label: "Eventi" },
  { id: "task", label: "Attività" },
  { id: "workout", label: "Allenamenti" },
  { id: "shipment", label: "Spedizioni" },
  { id: "birthday", label: "Compleanni" },
  { id: "travel", label: "Viaggi" },
  { id: "appointment", label: "Appuntamenti" },
  { id: "lesson", label: "Lezioni" },
];

const IDS = new Set<string>(FILTERS.map((f) => f.id));

/**
 * Il filtro a cui appartiene un evento. Le lezioni (imayoga) prima di tutto; viaggi e soggiorni insieme;
 * biglietti, prenotazioni e scadenze restano tra gli eventi.
 */
export function occurrenceFilter(o: Pick<Occurrence, "event">): CalendarFilter {
  const { event } = o;
  if (event.source === "imayoga") return "lesson";
  switch (event.kind) {
    case "shipment":
      return "shipment";
    case "birthday":
      return "birthday";
    case "travel":
    case "stay":
      return "travel";
    case "appointment":
      return "appointment";
    default:
      return "event";
  }
}

/** Il giorno con solo ciò che i filtri lasciano vedere. Il carico resta quello della giornata intera. */
export function filterDay(view: DayView, active: ReadonlySet<CalendarFilter>): DayView {
  if (active.size === 0) return view;
  const keep = (o: Occurrence) => active.has(occurrenceFilter(o));
  const tasks = active.has("task");
  return {
    ...view,
    occurrences: view.occurrences.filter(keep),
    quiet: view.quiet.filter(keep),
    timed: tasks ? view.timed : [],
    untimed: tasks ? view.untimed : [],
    workouts: active.has("workout") ? view.workouts : [],
  };
}

/** Il giorno non contiene niente da mostrare. */
export function isEmptyDay(view: DayView): boolean {
  return view.occurrences.length + view.quiet.length + view.timed.length + view.untimed.length + view.workouts.length === 0;
}

/** Legge i filtri salvati, ignorando valori sconosciuti o rovinati. */
export function parseFilters(raw: string | null): CalendarFilter[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return FILTERS.map((f) => f.id).filter((id) => value.includes(id) && IDS.has(id));
  } catch {
    return [];
  }
}

/** Accende o spegne un filtro, mantenendo l'ordine dei chip. */
export function toggleFilter(active: readonly CalendarFilter[], id: CalendarFilter): CalendarFilter[] {
  const next = new Set(active);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return FILTERS.map((f) => f.id).filter((f) => next.has(f));
}

/** I giorni della Lista: da `from` per `length` giorni. */
export const LIST_DAYS = 30;
