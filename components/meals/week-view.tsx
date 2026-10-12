import { DaySigns } from "@/components/days/day-signs";
import { Icon } from "@/components/ui/icon";
import { shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";
import { signsText, type DaySign } from "@/lib/days/marks";
import { NUTRIENT_LABEL, nutrientsOf, type Overrides } from "@/lib/meals/nutrients";
import { SLOTS, SLOT_LABEL, mealDot, type MealDot } from "@/lib/meals/rules";
import type { MealPlan, MealSlot } from "@/lib/supabase/types";

const DOT_CLASS: Record<MealDot, string> = {
  empty: "border border-line-2",
  ok: "bg-text-3",
  prep: "bg-accent",
};

/** La settimana intera: ogni giorno con i suoi quattro pasti; un tocco apre il foglio di quel pasto. */
export function WeekView({
  days,
  today,
  mealAt,
  signsOf,
  overrides,
  onOpen,
}: {
  days: LocalDate[];
  today: LocalDate;
  mealAt: (date: LocalDate, slot: MealSlot) => MealPlan | undefined;
  signsOf: (date: LocalDate) => DaySign[];
  overrides: Overrides;
  onOpen: (date: LocalDate, slot: MealSlot) => void;
}) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {days.map((d) => {
        const signs = signsOf(d);
        return (
          <li key={d} className="flex flex-col rounded-[14px] border border-line bg-surface px-4 pb-1 pt-3">
            <h3 className="label-mono flex items-center gap-2 pb-2">
              <span className={d === today ? "text-accent" : undefined}>
                {weekdayName(d).slice(0, 3)} {shortDate(d)}
                {d === today ? " · oggi" : ""}
              </span>
              <DaySigns signs={signs} />
              {signs.length ? <span className="sr-only">{signsText(signs)}</span> : null}
            </h3>
            <ul>
              {SLOTS.map((slot) => {
                const meal = mealAt(d, slot);
                const nutrients = meal ? nutrientsOf(meal.name, overrides) : [];
                const state = mealDot(meal);
                return (
                  <li key={slot} className="border-t border-line">
                    <button
                      type="button"
                      onClick={() => onOpen(d, slot)}
                      aria-label={
                        meal
                          ? `${SLOT_LABEL[slot]}, ${weekdayName(d)}: ${meal.name}${state === "prep" ? ", da preparare" : ""}. Modifica`
                          : `Aggiungi ${SLOT_LABEL[slot].toLowerCase()}, ${weekdayName(d)}`
                      }
                      className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="w-[74px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">{SLOT_LABEL[slot]}</span>
                      {meal ? (
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={`break-words text-[15px] leading-snug ${meal.prep_mode === "to_prep" && meal.prepared ? "text-text-2" : "text-text"}`}>{meal.name}</span>
                          {nutrients.length > 0 ? <span className="text-xs text-text-3">{nutrients.map((n) => NUTRIENT_LABEL[n]).join(" · ")}</span> : null}
                        </span>
                      ) : (
                        <span className="flex flex-1 items-center gap-1.5 text-sm text-text-3">
                          <Icon name="plus" size={14} />
                          Aggiungi
                        </span>
                      )}
                      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[state]}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
