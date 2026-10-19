"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { WearSheet } from "@/components/wardrobe/wear-sheet";
import { recordWear, undoWear, type WearChoice } from "@/lib/data/outfits";
import { useOutfitPlans, useOutfits, useWardrobeItems, useWears } from "@/lib/data/wardrobe-hooks";
import type { LocalDate } from "@/lib/dates/local";
import type { WardrobeItem } from "@/lib/supabase/types";
import { isPlanWorn, planIssues, planTitle, plansForDay, plansToConfirm, resolvePlan, type ResolvedPlan } from "@/lib/wardrobe/plans";

/** Risposte "No" a "Hai indossato l'outfit di ieri?": una comodità del dispositivo. Se si perdono, la domanda torna e basta. */
const ASKED_KEY = "planner-outfit-asked";

function readAsked(): string[] {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeAsked(ids: string[]) {
  try {
    // Bastano le ultime risposte: le pianificazioni vecchie non vengono più chieste.
    localStorage.setItem(ASKED_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    // Non salvato: la domanda tornerà alla prossima apertura.
  }
}

function Photos({ items, size = "size-11" }: { items: WardrobeItem[]; size?: string }) {
  return (
    <span className="flex shrink-0 gap-1">
      {items.slice(0, 4).map((item) => (
        <span key={item.id} className={`${size} overflow-hidden rounded-[10px] bg-surface-2`}>
          <WardrobePhoto item={item} />
        </span>
      ))}
    </span>
  );
}

/** Capi di cui si sta registrando l'utilizzo: quelli di una pianificazione, nel suo giorno. */
type Wearing = { resolved: ResolvedPlan; wornOn: LocalDate };

/**
 * Gli outfit pianificati per un giorno, in Oggi. Nel giorno stesso c'è "Indossato"; il giorno dopo l'app chiede
 * "Hai indossato l'outfit di ieri?", perché pianificare non vuol dire indossare: l'app chiede, non decide.
 */
export function DayOutfits({ day, today }: { day: LocalDate; today: LocalDate }) {
  const toast = useToast();
  const plans = useOutfitPlans().data;
  const outfits = useOutfits().data;
  const items = useWardrobeItems().data;
  const wears = useWears().data;
  const [asked, setAsked] = useState<string[]>(readAsked);
  const [wearing, setWearing] = useState<Wearing | null>(null);
  if (!plans || !outfits || !items) return null;

  const isToday = day === today;
  const resolved = plansForDay(plans, day).map((p) => resolvePlan(p, outfits, items));
  const questions = isToday && wears ? plansToConfirm(plans, outfits, items, wears, today, asked) : [];
  if (resolved.length === 0 && questions.length === 0) return null;

  function answerNo(r: ResolvedPlan) {
    const next = [...asked, r.plan.id];
    setAsked(next);
    writeAsked(next);
  }

  async function confirmWear(choices: WearChoice[]): Promise<boolean> {
    const target = wearing;
    if (!target) return false;
    let wearId: string;
    try {
      wearId = await recordWear(target.resolved.outfit?.id ?? target.resolved.plan.outfit_id, target.wornOn, choices);
    } catch {
      return false;
    }
    setWearing(null);
    toast({ message: "Utilizzo registrato", actionLabel: "Annulla", onAction: () => void undoWear(wearId, choices).catch(() => toast({ message: "Non annullato. Riprova.", tone: "warn" })) });
    return true;
  }

  return (
    <>
      {questions.length > 0 ? (
        <section aria-label="Outfit di ieri" className="flex flex-col gap-2">
          <h2 className="label-mono">Outfit di ieri</h2>
          <ul className="flex flex-col gap-2">
            {questions.map((r) => (
              <li key={r.plan.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <Photos items={r.items} size="size-10" />
                  <p className="min-w-0 text-sm">
                    Hai indossato <span className="text-text-2">{planTitle(r) === "Outfit" ? "l'outfit di ieri" : `"${planTitle(r)}"`}</span>?
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setWearing({ resolved: r, wornOn: r.plan.date })}>Sì</Button>
                  <Button variant="quiet" onClick={() => answerNo(r)}>
                    No
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resolved.length > 0 ? (
        <section aria-label="Outfit pianificati" className="flex flex-col gap-2">
          <h2 className="label-mono">Outfit</h2>
          <ul className="flex flex-col gap-2">
            {resolved.map((r) => {
              const issues = planIssues(r);
              const worn = !!wears && isPlanWorn(r, wears);
              return (
                <li key={r.plan.id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2">
                  <Link href="/lists/wardrobe" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl hover:bg-surface-2">
                    <Photos items={r.items} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-1 text-sm text-text">{planTitle(r)}</span>
                      {worn ? (
                        <span className="line-clamp-1 text-xs text-text-2">Indossato</span>
                      ) : issues.length > 0 ? (
                        <span className="line-clamp-1 text-xs text-text-2">{issues.join(" · ")}</span>
                      ) : null}
                    </span>
                  </Link>
                  {isToday && !worn && r.items.length > 0 ? (
                    <Button className="shrink-0" onClick={() => setWearing({ resolved: r, wornOn: day })}>
                      Indossato
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {wearing ? <WearSheet items={wearing.resolved.items} when={wearing.wornOn === today ? "oggi" : "ieri"} onConfirm={confirmWear} onClose={() => setWearing(null)} /> : null}
    </>
  );
}
