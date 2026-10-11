"use client";

import { useState } from "react";
import { MealSheet } from "@/components/meals/meal-sheet";
import { PantrySection, type PantryUse } from "@/components/meals/pantry-section";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Segmented } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { addMeal, removeMeal, renameMeal, setMealMode, setMealPrepared } from "@/lib/data/meals";
import { useMealMemory, useMeals, useUpcomingMeals } from "@/lib/data/meals-hooks";
import { usePantryItems, useShoppingActions } from "@/lib/data/shopping-hooks";
import { addDays, relativeDay, shortDate, weekStart, weekdayName, type LocalDate } from "@/lib/dates/local";
import { ingredientsIn, mealsUsing } from "@/lib/meals/ingredients";
import { SLOTS, SLOT_LABEL, mealDot, reminderDate, suggestionsFor, type MealDot } from "@/lib/meals/rules";
import { pantryGroups, type PantryEntry } from "@/lib/shopping/pantry";
import type { MealPlan, MealSlot, PrepMode } from "@/lib/supabase/types";

const MODES: { value: PrepMode; label: string }[] = [
  { value: "ready", label: "Pronto" },
  { value: "to_prep", label: "Da preparare" },
];

const DOT_CLASS: Record<MealDot, string> = {
  empty: "border border-line-2",
  ok: "bg-text-3",
  prep: "bg-accent",
};

const DOT_TEXT: Record<MealDot, string> = { empty: "non pianificato", ok: "a posto", prep: "da preparare" };

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function MealsPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const toast = useToast();
  const offline = useOffline();

  const [selected, setSelected] = useState<LocalDate | null>(null);
  const day = selected ?? today;
  const from = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const mealsQuery = useMeals(from);
  const memory = useMealMemory().data ?? [];
  const [editing, setEditing] = useState<MealSlot | null>(null);

  const meals = mealsQuery.data ?? [];
  const mealAt = (date: LocalDate, slot: MealSlot) => meals.find((m) => m.date === date && m.slot === slot);
  const missing = mealsQuery.data === undefined;
  const failed = missing && (offline || mealsQuery.isError);

  async function run(write: () => Promise<void>) {
    try {
      await write();
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
    }
  }

  // In casa: ogni ingrediente con i pasti in programma che lo nominano.
  const shopping = useShoppingActions();
  const upcoming = useUpcomingMeals(today);
  const pantry = pantryGroups(usePantryItems().data ?? []).flatMap((g) => g.entries);
  const uses: PantryUse[] = pantry.map((entry) => ({ entry, meals: mealsUsing(entry.name, upcoming, today) }));
  const finish = (entry: PantryEntry) => shopping.finish(entry.name, entry.items);

  const dayTitle = capitalize(weekdayName(day));
  const editingMeal = editing ? mealAt(day, editing) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Liste"
        title="Pasti"
        actions={
          <div className="-mr-2.5 flex">
            <button type="button" onClick={() => setSelected(addDays(from, -7))} aria-label="Settimana precedente" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
              <Icon name="chevronLeft" />
            </button>
            <button type="button" onClick={() => setSelected(addDays(from, 7))} aria-label="Settimana successiva" className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text">
              <Icon name="chevronRight" />
            </button>
          </div>
        }
      />

      <nav aria-label="Giorni della settimana" className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const active = d === day;
          const dots = SLOTS.map((slot) => mealDot(mealAt(d, slot)));
          const planned = dots.filter((s) => s !== "empty").length;
          const toPrep = dots.filter((s) => s === "prep").length;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              aria-label={`${weekdayName(d)} ${shortDate(d)}: ${planned === 1 ? "1 pasto pianificato" : `${planned} pasti pianificati`}${toPrep ? `, ${toPrep} da preparare` : ""}`}
              onClick={() => setSelected(d)}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border text-[13px] transition-colors ${
                active ? "border-line-2 bg-surface-2 text-text" : "border-transparent text-text-2 hover:bg-surface-2"
              }`}
            >
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">{weekdayName(d).slice(0, 3)}</span>
              <span className={d === today ? "text-accent" : undefined}>{Number(d.slice(8))}</span>
              <span aria-hidden className="flex gap-[3px]">
                {dots.map((state, i) => (
                  <span key={i} className={`size-1.5 rounded-full ${DOT_CLASS[state]}`} />
                ))}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="label-mono">
          {dayTitle} {shortDate(day)}
          {day === today ? " · oggi" : ""}
        </h2>
        {day !== today ? (
          <button type="button" onClick={() => setSelected(null)} className="-my-2.5 min-h-11 rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2">
            Torna a oggi
          </button>
        ) : null}
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "Questa settimana non è disponibile senza rete. Offline trovi la settimana corrente." : "Non riesco a caricare i pasti. Controlla la connessione."}</p>
          <button type="button" onClick={() => mealsQuery.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
            Riprova
          </button>
        </div>
      ) : missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico i pasti…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {SLOTS.map((slot) => {
            const meal = mealAt(day, slot);
            return (
              <li key={slot} className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="label-mono flex items-center gap-2">
                    <span aria-hidden className={`size-1.5 rounded-full ${DOT_CLASS[mealDot(meal)]}`} />
                    {SLOT_LABEL[slot]}
                    <span className="sr-only">: {DOT_TEXT[mealDot(meal)]}</span>
                  </span>
                </div>
                {meal ? (
                  <MealRow
                    meal={meal}
                    today={today}
                    ingredients={ingredientsIn(meal.name, pantry)}
                    onFinish={finish}
                    onOpen={() => setEditing(slot)}
                    onMode={(mode) => run(() => setMealMode(meal, mode, today))}
                    onPrepared={(prepared) => run(() => setMealPrepared(meal, prepared))}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(slot)}
                    aria-label={`Aggiungi ${SLOT_LABEL[slot].toLowerCase()}`}
                    className="-ml-2.5 flex min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="plus" size={16} />
                    Aggiungi
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PantrySection uses={uses} today={today} onFinish={finish} />

      {editing ? (
        <MealSheet
          key={`${day}-${editing}`}
          slot={editing}
          dayLabel={day === today ? "oggi" : `${weekdayName(day)} ${shortDate(day)}`}
          meal={editingMeal}
          suggestions={suggestionsFor(memory, editing)}
          pantry={uses.filter((u) => u.meals.length === 0).map((u) => u.entry)}
          onClose={() => setEditing(null)}
          onAdd={(name, mode) => {
            const slot = editing;
            setEditing(null);
            run(() => addMeal(day, slot, name, mode, today));
          }}
          onRename={(name) => {
            setEditing(null);
            if (editingMeal) run(() => renameMeal(editingMeal, name));
          }}
          onRemove={() => {
            setEditing(null);
            if (editingMeal) run(() => removeMeal(editingMeal));
          }}
        />
      ) : null}
    </>
  );
}

function MealRow({
  meal,
  today,
  ingredients,
  onFinish,
  onOpen,
  onMode,
  onPrepared,
}: {
  meal: MealPlan;
  today: LocalDate;
  ingredients: PantryEntry[];
  onFinish: (entry: PantryEntry) => void;
  onOpen: () => void;
  onMode: (mode: PrepMode) => void;
  onPrepared: (prepared: boolean) => void;
}) {
  const toPrep = meal.prep_mode === "to_prep";
  const prepDay = reminderDate(meal.date, today);
  // Riga discreta: dice dove si trova il promemoria, senza avvisi.
  const hint = !toPrep || meal.prepared
    ? null
    : meal.reminder_task_id && prepDay
      ? `Promemoria in Oggi: ${relativeDay(prepDay, today)}`
      : "Senza promemoria";
  // Cucinato o già in tavola: gli ingredienti in casa si possono segnare come finiti da qui.
  const eaten = meal.prepared || meal.date <= today;

  return (
    <>
      <button type="button" onClick={onOpen} aria-label={`Modifica: ${meal.name}`} className="-my-1 flex min-h-11 items-center text-left text-[17px] leading-snug">
        <span className={`min-w-0 break-words ${toPrep && meal.prepared ? "text-text-2" : "text-text"}`}>{meal.name}</span>
      </button>
      <Segmented label={`Modalità: ${meal.name}`} value={meal.prep_mode} options={MODES} onChange={onMode} />
      {toPrep ? (
        <div className="flex items-center justify-between gap-3">
          <label className="-ml-2.5 flex min-h-11 cursor-pointer items-center gap-1 pr-2 text-sm">
            <span className="flex size-11 items-center justify-center">
              <input type="checkbox" className="peer sr-only" checked={meal.prepared} onChange={(e) => onPrepared(e.target.checked)} />
              <span
                className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                  meal.prepared ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
                }`}
              >
                <Icon name="check" size={14} strokeWidth={2.2} />
              </span>
            </span>
            Preparato
          </label>
          {hint ? <span className="text-right text-xs text-text-3">{hint}</span> : null}
        </div>
      ) : null}
      {ingredients.length === 0 ? null : eaten ? (
        <div className="-my-1 flex flex-wrap items-center gap-x-1">
          <span className="pr-1 text-xs text-text-3">Finito?</span>
          {ingredients.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => onFinish(entry)}
              aria-label={`Finito: ${entry.name}`}
              style={departmentStyle(entry.department)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <span className="flex text-(--dept)">
                <ProductIcon name={entry.name} department={entry.department} size={16} />
              </span>
              {entry.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
          <span>In casa</span>
          {ingredients.map((entry) => (
            <span key={entry.key} style={departmentStyle(entry.department)} className="flex items-center gap-1.5 text-text-2">
              <span className="flex text-(--dept)">
                <ProductIcon name={entry.name} department={entry.department} size={16} />
              </span>
              {entry.name}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
