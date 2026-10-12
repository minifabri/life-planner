"use client";

import { useState } from "react";
import { Button } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/page-header";
import { NUTRIENT_LABEL } from "@/lib/meals/nutrients";
import { SLOT_LABEL } from "@/lib/meals/rules";
import type { Idea } from "@/lib/meals/suggest";
import type { MealSlot } from "@/lib/supabase/types";

const PAGE = 3;

/** Idee per i momenti ancora vuoti del giorno scelto: regole locali sui piatti abituali, sui nutrienti e su ciò che c'è in casa. */
export function MealIdeasView({
  slots,
  note,
  past,
  onAdd,
  onLess,
  onHide,
}: {
  /** I momenti ancora vuoti del giorno, ognuno con le sue idee dalla più adatta. */
  slots: { slot: MealSlot; ideas: Idea[] }[];
  /** La frase sul bilancio della settimana. */
  note: string;
  /** Il giorno è già passato: non c'è niente da proporre. */
  past: boolean;
  onAdd: (idea: Idea) => void;
  /** "Meno spesso": fuori dalle Idee per qualche settimana. */
  onLess: (idea: Idea) => void;
  onHide: (idea: Idea) => void;
}) {
  const [pages, setPages] = useState<Partial<Record<MealSlot, number>>>({});

  if (past) return <EmptyState title="Le idee valgono da oggi in avanti." hint="Scegli oggi o un giorno che deve ancora venire." />;
  if (slots.length === 0) return <EmptyState title="Giorno al completo." hint="Tutti e quattro i pasti sono già scelti. Per altre idee scegli un altro giorno." />;

  return (
    <>
      <p className="text-sm text-text-2">{note}</p>
      {slots.map(({ slot, ideas }) => {
        const count = Math.max(1, Math.ceil(ideas.length / PAGE));
        const current = (pages[slot] ?? 0) % count;
        const shown = ideas.slice(current * PAGE, current * PAGE + PAGE);
        return (
          <section key={slot} aria-label={`Idee per ${SLOT_LABEL[slot].toLowerCase()}`} className="flex flex-col gap-2">
            <h3 className="label-mono">{SLOT_LABEL[slot]}</h3>
            {shown.length === 0 ? (
              <p className="text-sm text-text-3">Nessuna idea da proporre per questo momento.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown.map((idea) => (
                  <li key={idea.key} className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <p className="flex items-baseline justify-between gap-3 text-[17px] leading-snug">
                        <span className="min-w-0 break-words">{idea.name}</span>
                        {idea.isNew ? <span className="label-mono shrink-0">Nuovo</span> : null}
                      </p>
                      {idea.nutrients.length > 0 ? <p className="text-xs text-text-3">{idea.nutrients.map((n) => NUTRIENT_LABEL[n]).join(" · ")}</p> : null}
                      <p className="text-sm text-text-2">{idea.reason}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button onClick={() => onAdd(idea)}>
                        Aggiungi<span className="sr-only">: {idea.name}</span>
                      </Button>
                      <span className="-mr-4 flex flex-wrap">
                        <Button variant="quiet" onClick={() => onLess(idea)}>
                          Meno spesso<span className="sr-only">: {idea.name}</span>
                        </Button>
                        <Button variant="quiet" onClick={() => onHide(idea)}>
                          Non proporre<span className="sr-only">: {idea.name}</span>
                        </Button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {count > 1 ? (
              <Button variant="quiet" className="-ml-4 self-start" onClick={() => setPages({ ...pages, [slot]: current + 1 })}>
                Altre idee<span className="sr-only"> per {SLOT_LABEL[slot].toLowerCase()}</span>
              </Button>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
