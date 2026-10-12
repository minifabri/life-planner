"use client";

import Link from "next/link";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { useOutfitPlans, useOutfits, useWardrobeItems } from "@/lib/data/wardrobe-hooks";
import type { LocalDate } from "@/lib/dates/local";
import { planIssues, planTitle, plansForDay, resolvePlan } from "@/lib/wardrobe/plans";

/** Gli outfit pianificati per un giorno, in Oggi: una riga che porta al Guardaroba. Se non ce ne sono, niente. */
export function DayOutfits({ day }: { day: LocalDate }) {
  const plans = useOutfitPlans().data;
  const outfits = useOutfits().data;
  const items = useWardrobeItems().data;
  if (!plans || !outfits || !items) return null;
  const resolved = plansForDay(plans, day).map((p) => resolvePlan(p, outfits, items));
  if (resolved.length === 0) return null;

  return (
    <section aria-label="Outfit pianificati" className="flex flex-col gap-2">
      <h2 className="label-mono">Outfit</h2>
      <ul className="flex flex-col gap-2">
        {resolved.map((r) => {
          const issues = planIssues(r);
          return (
            <li key={r.plan.id}>
              <Link href="/lists/wardrobe" className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface p-2 hover:bg-surface-2">
                <span className="flex shrink-0 gap-1">
                  {r.items.slice(0, 4).map((item) => (
                    <span key={item.id} className="size-11 overflow-hidden rounded-[10px] bg-surface-2">
                      <WardrobePhoto item={item} />
                    </span>
                  ))}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-1 text-sm text-text">{planTitle(r)}</span>
                  {issues.length > 0 ? <span className="line-clamp-1 text-xs text-text-2">{issues.join(" · ")}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
