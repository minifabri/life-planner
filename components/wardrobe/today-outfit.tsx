"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { WearSheet } from "@/components/wardrobe/wear-sheet";
import { recordWear, undoWear, type WearChoice } from "@/lib/data/outfits";
import { importDeviceAnswers, saveAnswer } from "@/lib/data/questions";
import { useAnsweredKeys, useImportOnce } from "@/lib/data/questions-hooks";
import { useOutfitPlans, useOutfits, useWardrobeItems, useWears } from "@/lib/data/wardrobe-hooks";
import type { LocalDate } from "@/lib/dates/local";
import type { WardrobeItem } from "@/lib/supabase/types";
import { isPlanWorn, planIssues, planTitle, plansForDay, plansToConfirm, resolvePlan, type ResolvedPlan } from "@/lib/wardrobe/plans";

/** Dove le versioni precedenti salvavano sul dispositivo le risposte "No" a "Hai indossato l'outfit di ieri?". */
const DEVICE_ANSWERS_KEY = "planner-outfit-asked";

/** La risposta "No" a "Hai indossato…?" per una pianificazione, sul server: vale su tutti i dispositivi. */
const WORN = "worn:";
const wornKey = (planId: string) => `${WORN}${planId}`;

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
  const answered = useAnsweredKeys();
  const [wearing, setWearing] = useState<Wearing | null>(null);
  useImportOnce(() => importDeviceAnswers(DEVICE_ANSWERS_KEY, "no", wornKey));
  if (!plans || !outfits || !items) return null;

  const isToday = day === today;
  const resolved = plansForDay(plans, day).map((p) => resolvePlan(p, outfits, items));
  const asked = answered?.filter((k) => k.startsWith(WORN)).map((k) => k.slice(WORN.length));
  const questions = isToday && wears && asked ? plansToConfirm(plans, outfits, items, wears, today, asked) : [];
  if (resolved.length === 0 && questions.length === 0) return null;

  async function answerNo(r: ResolvedPlan) {
    let undo: () => Promise<void>;
    try {
      undo = await saveAnswer(wornKey(r.plan.id), "no");
    } catch {
      toast({ message: "Risposta non salvata. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: "Va bene", actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
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
                  <Button variant="quiet" onClick={() => void answerNo(r)}>
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
