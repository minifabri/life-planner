"use client";

import { useState } from "react";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Icon } from "@/components/ui/icon";
import { relativeDay, weekdayName, type LocalDate } from "@/lib/dates/local";
import { SLOT_LABEL } from "@/lib/meals/rules";
import { NO_DEPARTMENT, compareDepartments } from "@/lib/shopping/list";
import type { PantryEntry } from "@/lib/shopping/pantry";
import type { MealPlan } from "@/lib/supabase/types";

/** Un ingrediente in casa con i pasti in programma che lo nominano. */
export type PantryUse = { entry: PantryEntry; meals: MealPlan[] };

/** Dove si usa: "oggi · cena", "gio · pranzo", "20 ott · cena"; se i pasti sono più d'uno, quanti altri. */
function whereLabel(meals: MealPlan[], today: LocalDate): string {
  const [first, ...others] = meals;
  const day = relativeDay(first.date, today);
  const short = day === weekdayName(first.date) ? day.slice(0, 3) : day;
  return `${short} · ${SLOT_LABEL[first.slot].toLowerCase()}${others.length ? ` +${others.length}` : ""}`;
}

function byDepartment(uses: PantryUse[]): { department: string; uses: PantryUse[] }[] {
  const groups = new Map<string, PantryUse[]>();
  for (const use of uses) {
    const department = use.entry.department ?? NO_DEPARTMENT;
    groups.set(department, [...(groups.get(department) ?? []), use]);
  }
  return [...groups.entries()].map(([department, uses]) => ({ department, uses })).sort((a, b) => compareDepartments(a.department, b.department));
}

/**
 * "In casa": gli ingredienti comprati (spuntati nella Spesa) e non ancora finiti, da usare per i pasti.
 * Chiusa di default. Prima quelli ancora da usare, poi quelli già nominati in un pasto in programma;
 * "Finito" toglie un ingrediente dall'elenco.
 */
export function PantrySection({ uses, today, onFinish }: { uses: PantryUse[]; today: LocalDate; onFinish: (entry: PantryEntry) => void }) {
  const [open, setOpen] = useState(false);

  const count = uses.length;
  const free = uses.filter((u) => u.meals.length === 0);
  const planned = uses.filter((u) => u.meals.length > 0);
  const summary = [
    count > 0 ? (count === 1 ? "1 ingrediente" : `${count} ingredienti`) : null,
    planned.length > 0 && free.length > 0 ? `${free.length} da usare` : null,
    planned.length > 0 && free.length === 0 ? "tutti nei pasti" : null,
  ].filter(Boolean);

  const row = (use: PantryUse) => {
    const { entry, meals } = use;
    const used = meals.length > 0;
    return (
      <li key={entry.key} className="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0" style={departmentStyle(entry.department)}>
        <span className={`flex shrink-0 text-(--dept) ${used ? "opacity-60" : ""}`}>
          <ProductIcon name={entry.name} department={entry.department} size={20} />
        </span>
        <span className={`min-w-0 flex-1 break-words py-1.5 text-[15px] ${used ? "text-text-2" : ""}`}>{entry.name}</span>
        {used ? (
          <span className="shrink-0 font-mono text-[11px] text-text-3">{whereLabel(meals, today)}</span>
        ) : entry.quantity ? (
          <span className="shrink-0 font-mono text-[11px] text-text-2">{entry.quantity}</span>
        ) : null}
        <button
          type="button"
          onClick={() => onFinish(entry)}
          aria-label={`Finito: ${entry.name}`}
          className="-mr-2.5 min-h-11 shrink-0 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
        >
          Finito
        </button>
      </li>
    );
  };

  return (
    <section className="flex flex-col">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 text-sm text-text-2 hover:text-text"
        >
          <span>{["In casa", ...summary].join(" · ")}</span>
          <Icon name="chevronRight" size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </h2>
      {open ? (
        count === 0 ? (
          <p className="px-1 pt-3 text-sm text-text-3">Ancora niente. Quello che spunti nella Spesa compare qui, pronto per i tuoi pasti.</p>
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            {byDepartment(free).map((group) => (
              <section key={group.department} aria-label={group.department} className="flex flex-col gap-1" style={departmentStyle(group.department)}>
                <h3 className="label-mono flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-(--dept)" />
                  {group.department}
                  <span className="font-normal">· {group.uses.length}</span>
                </h3>
                <ul className="flex flex-col">{group.uses.map(row)}</ul>
              </section>
            ))}
            {planned.length > 0 ? (
              <section aria-label="Già nei pasti" className="flex flex-col gap-1">
                <h3 className="label-mono">
                  Già nei pasti <span className="font-normal">· {planned.length}</span>
                </h3>
                <ul className="flex flex-col">{planned.map(row)}</ul>
              </section>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
