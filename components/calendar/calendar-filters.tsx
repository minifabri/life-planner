"use client";

import { useMemo, useSyncExternalStore } from "react";
import { FILTERS, parseFilters, toggleFilter, type CalendarFilter } from "@/lib/calendar/filter";

/** I filtri restano su questo dispositivo, uguali in Settimana, Mese e Lista. */
const KEY = "calendar-filters";
const EMPTY: CalendarFilter[] = [];

let current: CalendarFilter[] | null = null;
const listeners = new Set<() => void>();

function read(): CalendarFilter[] {
  if (current) return current;
  try {
    current = parseFilters(localStorage.getItem(KEY));
  } catch {
    current = EMPTY;
  }
  return current;
}

function write(next: CalendarFilter[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Senza localStorage i filtri valgono finché l'app resta aperta.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** I filtri accesi; vuoto vuol dire tutto. */
export function useCalendarFilters() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  const active = useMemo(() => new Set(list), [list]);
  return {
    list,
    active,
    toggle: (id: CalendarFilter) => write(toggleFilter(read(), id)),
    clear: () => write(EMPTY),
  };
}

const chip = "flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors";

/** Chip dei filtri: «Tutto» e un chip per tipo, scorrevoli su mobile. */
export function CalendarFilters() {
  const { active, toggle, clear } = useCalendarFilters();
  const all = active.size === 0;
  return (
    <div role="group" aria-label="Filtri del calendario" className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
      <button
        type="button"
        aria-pressed={all}
        onClick={clear}
        className={`${chip} ${all ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:bg-surface-2 hover:text-text"}`}
      >
        Tutto
      </button>
      {FILTERS.map((f) => {
        const on = active.has(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(f.id)}
            className={`${chip} ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-text-2 hover:bg-surface-2 hover:text-text"}`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
