"use client";

import { Button } from "@/components/ui/form";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { relativeDay, type LocalDate } from "@/lib/dates/local";
import { planIssues, planTitle, type ResolvedPlan } from "@/lib/wardrobe/plans";

/** Gli outfit in programma, dal giorno più vicino. Un problema (capo da lavare, capo rimosso) si segnala e basta. */
export function PlanList({
  plans,
  today,
  onWear,
  onChange,
  onRemove,
}: {
  plans: ResolvedPlan[];
  today: LocalDate;
  onWear: (plan: ResolvedPlan) => void;
  onChange: (plan: ResolvedPlan) => void;
  onRemove: (plan: ResolvedPlan) => void;
}) {
  if (plans.length === 0) return null;
  return (
    <section aria-label="Outfit in programma" className="flex flex-col gap-2">
      <h2 className="label-mono">In programma</h2>
      <ul className="flex flex-col gap-2">
        {plans.map((resolved) => {
          const issues = planIssues(resolved);
          return (
            <li key={resolved.plan.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="line-clamp-1 text-sm text-text">{planTitle(resolved)}</span>
                <span className="shrink-0 text-xs capitalize text-text-2">{relativeDay(resolved.plan.date, today)}</span>
              </div>
              <ul aria-label="Capi" className="flex gap-1.5 overflow-x-auto">
                {resolved.items.map((item) => (
                  <li key={item.id} className="size-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
                    <WardrobePhoto item={item} />
                  </li>
                ))}
              </ul>
              {issues.length > 0 ? <p className="text-xs text-text-2">{issues.join(" · ")}</p> : null}
              <div className="-mb-1 -ml-3 flex flex-wrap gap-1">
                {resolved.plan.date === today && resolved.items.length > 0 ? (
                  <Button variant="quiet" onClick={() => onWear(resolved)}>
                    Indossato oggi
                  </Button>
                ) : null}
                <Button variant="quiet" onClick={() => onChange(resolved)}>
                  Cambia giorno
                </Button>
                <Button variant="quiet" onClick={() => onRemove(resolved)}>
                  Togli
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
