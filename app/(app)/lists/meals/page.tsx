"use client";

import { useState } from "react";
import { DayMarksLine, DaySigns } from "@/components/days/day-signs";
import { BalanceCard } from "@/components/meals/balance-card";
import { DayNutrients } from "@/components/meals/day-nutrients";
import { MealIdeasView } from "@/components/meals/ideas-view";
import { MealSheet } from "@/components/meals/meal-sheet";
import { PantrySection, type PantryUse } from "@/components/meals/pantry-section";
import { WeekView } from "@/components/meals/week-view";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Segmented } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useDayContext } from "@/lib/data/day-marks-hooks";
import { useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { addMeal, hideMealIdea, removeMeal, saveMeal, setMealMode, setMealPrepared, snoozeMealIdea } from "@/lib/data/meals";
import { useMealMemory, useMeals, useUpcomingMeals } from "@/lib/data/meals-hooks";
import { usePantryItems, useShoppingActions } from "@/lib/data/shopping-hooks";
import { addDays, relativeDay, shortDate, weekStart, weekdayName, type LocalDate } from "@/lib/dates/local";
import { daySigns, signsText } from "@/lib/days/marks";
import { ingredientsIn, mealsUsing } from "@/lib/meals/ingredients";
import { daySummary, microTips } from "@/lib/meals/micros";
import { NUTRIENT_LABEL, balanceNote, hasFoods, mealNutrients, nutrientOverrides, nutrientsOf, weekBalance } from "@/lib/meals/nutrients";
import { SLOTS, SLOT_LABEL, SNOOZE_DAYS, mealDot, mealFoods, mealTitle, reminderDate, suggestionsFor, type MealDot } from "@/lib/meals/rules";
import { suggestMeals, type Idea } from "@/lib/meals/suggest";
import { pantryGroups, type PantryEntry } from "@/lib/shopping/pantry";
import type { MealPlan, MealSlot, Nutrient, PrepMode } from "@/lib/supabase/types";

type View = "day" | "week" | "ideas";

const VIEWS: { value: View; label: string; tour?: string }[] = [
  { value: "day", label: "Giorno" },
  { value: "week", label: "Settimana", tour: "meals-week" },
  { value: "ideas", label: "Idee", tour: "meals-ideas" },
];

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

function nutrientsLine(nutrients: Nutrient[]) {
  return nutrients.length > 0 ? nutrients.map((n) => NUTRIENT_LABEL[n]).join(" · ") : "Nutrienti non riconosciuti: tocca per indicarli";
}

/** La riga sotto il piatto: i condimenti, se ci sono, poi i nutrienti. */
function detailLine(meal: MealPlan, nutrients: Nutrient[]) {
  return meal.condiments ? `Con ${meal.condiments} · ${nutrientsLine(nutrients)}` : nutrientsLine(nutrients);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function MealsPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const toast = useToast();
  const offline = useOffline();

  const [view, setView] = useState<View>("day");
  const [selected, setSelected] = useState<LocalDate | null>(null);
  const day = selected ?? today;
  const from = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const mealsQuery = useMeals(from);
  // Com'è fatto ogni giorno (ufficio, viaggio, allenamento): aiuta a decidere cosa preparare.
  const { marks, workouts } = useDayContext(from, days[6]);
  const memory = useMealMemory().data ?? [];
  const [editing, setEditing] = useState<{ date: LocalDate; slot: MealSlot } | null>(null);

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
  const editingMeal = editing ? mealAt(editing.date, editing.slot) : undefined;

  // Nutrienti: riconosciuti dal nome, o corretti a mano nel foglio del pasto.
  const overrides = nutrientOverrides(memory);
  const balance = weekBalance(meals, days, overrides);
  const dayMeals = meals.filter((m) => m.date === day);
  const extras = mealAt(day, "extra");
  const signsOf = (d: LocalDate) => daySigns(d, marks, workouts, today);

  // Idee: per la varietà contano anche la settimana prima e, da oggi, quella dopo.
  const before = useMeals(addDays(from, -7)).data;
  const known = [...new Map([...(before ?? []), ...upcoming, ...meals].map((m) => [m.id, m])).values()];
  const unused = uses.filter((u) => u.meals.length === 0).map((u) => u.entry);
  const ideasFor = (date: LocalDate, slot: MealSlot) =>
    suggestMeals({ memory, meals: known, pantry: unused, overrides }, { day: date, slot, weekFrom: from, signs: signsOf(date) });
  const ideaSlots = view === "ideas" && !missing ? SLOTS.filter((slot) => !mealAt(day, slot)).map((slot) => ({ slot, ideas: ideasFor(day, slot) })) : [];
  // Le stesse idee nel foglio di un pasto ancora vuoto, da oggi in avanti.
  const sheetIdeas = editing && !editingMeal && editing.slot !== "extra" && editing.date >= today ? ideasFor(editing.date, editing.slot) : [];

  function addIdea(idea: Idea) {
    run(() => addMeal(day, idea.slot, idea.name, idea.mode, today));
    toast({ message: `Aggiunto: ${SLOT_LABEL[idea.slot].toLowerCase()} di ${day === today ? "oggi" : weekdayName(day)}` });
  }

  function lessIdea(idea: Idea) {
    run(() => snoozeMealIdea(idea.slot, idea.name, idea.mode, addDays(today, SNOOZE_DAYS)));
    toast({
      message: `Per tre settimane non lo propongo per ${SLOT_LABEL[idea.slot].toLowerCase()}`,
      actionLabel: "Annulla",
      onAction: () => void run(() => snoozeMealIdea(idea.slot, idea.name, idea.mode, null)),
    });
  }

  function hideIdea(idea: Idea) {
    run(() => hideMealIdea(idea.slot, idea.name, idea.mode, true));
    toast({
      message: `Non lo propongo più per ${SLOT_LABEL[idea.slot].toLowerCase()}`,
      actionLabel: "Annulla",
      onAction: () => void run(() => hideMealIdea(idea.slot, idea.name, idea.mode, false)),
    });
  }

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

      <Segmented label="Vista" value={view} options={VIEWS} onChange={setView} />

      {view === "week" ? (
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h2 className="label-mono">
            {shortDate(from)} – {shortDate(days[6])}
            {from === weekStart(today) ? " · questa settimana" : ""}
          </h2>
          {from !== weekStart(today) ? (
            <button type="button" onClick={() => setSelected(null)} className="-my-2.5 min-h-11 rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2">
              Torna a oggi
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <nav aria-label="Giorni della settimana" className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const active = d === day;
              const dots = SLOTS.map((slot) => mealDot(mealAt(d, slot)));
              const planned = dots.filter((s) => s !== "empty").length;
              const toPrep = dots.filter((s) => s === "prep").length;
              const signs = daySigns(d, marks, workouts, today);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${weekdayName(d)} ${shortDate(d)}: ${planned === 1 ? "1 pasto pianificato" : `${planned} pasti pianificati`}${toPrep ? `, ${toPrep} da preparare` : ""}${signs.length ? `, ${signsText(signs)}` : ""}`}
                  onClick={() => setSelected(d)}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border py-1.5 text-[13px] transition-colors ${
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
                  <DaySigns signs={signs} />
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
          <DayMarksLine key={day} day={day} today={today} marks={marks} workouts={workouts} className="-my-3" />
        </>
      )}

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
      ) : view === "week" ? (
        <>
            <BalanceCard balance={balance} days={days} today={today} />
            <WeekView days={days} today={today} mealAt={mealAt} signsOf={signsOf} overrides={overrides} onOpen={(date, slot) => setEditing({ date, slot })} />
        </>
      ) : view === "ideas" ? (
        <MealIdeasView key={day} slots={ideaSlots} note={balanceNote(balance)} tips={microTips(daySummary(dayMeals, overrides))} past={day < today} onAdd={addIdea} onLess={lessIdea} onHide={hideIdea} />
      ) : (
        <>
        <ul className="flex flex-col gap-2" data-tour="meals-slots">
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
                    nutrients={mealNutrients(meal, overrides)}
                    ingredients={ingredientsIn(mealFoods(meal), pantry)}
                    onFinish={finish}
                    onOpen={() => setEditing({ date: day, slot })}
                    onMode={(mode) => run(() => setMealMode(meal, mode, today))}
                    onPrepared={(prepared) => run(() => setMealPrepared(meal, prepared))}
                  />
                ) : (
                  <div className="-mx-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing({ date: day, slot })}
                      aria-label={`Aggiungi ${SLOT_LABEL[slot].toLowerCase()}`}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                    >
                      <Icon name="plus" size={16} />
                      Aggiungi
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => addMeal(day, slot, "", "ready", today, undefined, true))}
                      aria-label={`${SLOT_LABEL[slot]}: mangiato fuori`}
                      className="flex min-h-11 items-center rounded-lg px-2.5 text-sm text-text-3 hover:bg-surface-2 hover:text-text"
                    >
                      Mangiato fuori
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          <li className="flex flex-col gap-2.5 rounded-[14px] border border-dashed border-line bg-surface px-4 py-3">
            <span className="label-mono">
              Extra <span className="font-normal normal-case tracking-normal">· facoltativo</span>
            </span>
            {extras ? (
              <>
                <button type="button" onClick={() => setEditing({ date: day, slot: "extra" })} aria-label={`Modifica gli extra: ${extras.name}`} className="-my-1 flex min-h-11 items-center text-left text-[17px] leading-snug">
                  <span className="min-w-0 break-words">{extras.name}</span>
                </button>
                <p className="-mt-2 text-xs text-text-3">{nutrientsLine(nutrientsOf(extras.name, overrides))}</p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing({ date: day, slot: "extra" })}
                aria-label="Aggiungi extra: fuori pasto e condimenti"
                className="-ml-2.5 flex min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-left text-sm text-text-2 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="plus" size={16} />
                Fuori pasto e condimenti
              </button>
            )}
          </li>
        </ul>
        <DayNutrients key={day} summary={daySummary(dayMeals, overrides)} extras={!!extras} />
        </>
      )}

      {view === "ideas" ? null : <PantrySection uses={uses} today={today} onFinish={finish} />}

      {editing ? (
        <MealSheet
          key={`${editing.date}-${editing.slot}`}
          slot={editing.slot}
          dayLabel={editing.date === today ? "oggi" : `${weekdayName(editing.date)} ${shortDate(editing.date)}`}
          meal={editingMeal}
          suggestions={suggestionsFor(memory, editing.slot)}
          ideas={sheetIdeas}
          onLess={lessIdea}
          pantry={unused}
          overrides={overrides}
          onClose={() => setEditing(null)}
          onAdd={(name, mode, nutrients, out, condiments) => {
            const { date, slot } = editing;
            setEditing(null);
            run(() => addMeal(date, slot, name, mode, today, nutrients, out, condiments));
          }}
          onSave={(name, out, condiments, nutrients) => {
            setEditing(null);
            if (editingMeal) run(() => saveMeal(editingMeal, name, out, condiments, nutrients));
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
  nutrients,
  ingredients,
  onFinish,
  onOpen,
  onMode,
  onPrepared,
}: {
  meal: MealPlan;
  today: LocalDate;
  nutrients: Nutrient[];
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

  if (meal.eaten_out) {
    return (
      <>
        <button type="button" onClick={onOpen} aria-label={`Modifica: ${mealTitle(meal)}`} className="-my-1 flex min-h-11 items-center text-left text-[17px] leading-snug">
          <span className={`min-w-0 break-words ${meal.name ? "text-text" : "text-text-2"}`}>{mealTitle(meal)}</span>
        </button>
        <p className="-mt-2 text-xs text-text-3">{hasFoods(meal) ? `Fuori · ${detailLine(meal, nutrients)}` : "Non conta nei nutrienti. Tocca per dire cosa hai mangiato, se vuoi."}</p>
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={onOpen} aria-label={`Modifica: ${meal.name}`} className="-my-1 flex min-h-11 items-center text-left text-[17px] leading-snug">
        <span className={`min-w-0 break-words ${toPrep && meal.prepared ? "text-text-2" : "text-text"}`}>{meal.name}</span>
      </button>
      <p className="-mt-2 text-xs text-text-3">{detailLine(meal, nutrients)}</p>
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
