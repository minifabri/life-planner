"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { LaundryPlanSheet } from "@/components/wardrobe/laundry-plan-sheet";
import { useTaskActions, useTimezone } from "@/lib/data/hooks";
import { planLaundry } from "@/lib/data/laundry";
import { useLaundry, type LaundryGroupState } from "@/lib/data/laundry-hooks";
import { addDays, dueLabel, relativeDay, type LocalDate } from "@/lib/dates/local";
import { requestLaundryDone } from "@/lib/nav/laundry-handoff";
import type { WashGroup } from "@/lib/supabase/types";
import { WASH_GROUP_LABEL, WASH_GROUP_OF } from "@/lib/wardrobe/laundry";

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

/** Quando è in programma la lavatrice, e se arriva tardi rispetto al capo che serve. */
function plannedText(p: LaundryGroupState, today: LocalDate): { text: string; late: boolean } | null {
  const day = p.planned?.date ?? p.planned?.due_date;
  if (!p.planned) return null;
  const when = day ? `In programma ${relativeDay(day, today)}` : "In programma";
  const late = !!(p.deadline && day && day > p.deadline);
  return { text: late ? `${when}, ma il capo serve prima` : when, late };
}

/** Il dettaglio della proposta: quanti capi e perché. Il carico pieno dice già quanti sono. */
function detail(p: LaundryGroupState): string {
  const full = p.reasons.some((r) => r.endsWith("un carico pieno"));
  return [...(full ? [] : [p.items.length === 1 ? "1 capo" : `${p.items.length} capi`]), ...p.reasons].join(" · ");
}

/** In Oggi conta solo ciò che preme: un capo che serve entro domani e nessuna lavatrice in tempo. */
function pressing(p: LaundryGroupState, today: LocalDate): boolean {
  if (!p.deadline || p.deadline > addDays(today, 1)) return false;
  const day = p.planned?.date ?? p.planned?.due_date;
  return !day || day > p.deadline;
}

/**
 * Le lavatrici (D69). In Guardaroba: i capi da lavare per gruppo (un tocco filtra il catalogo) e le proposte.
 * In Oggi (`mode = "today"`): solo le proposte urgenti per oggi o domani.
 */
export function LaundryPanel({
  today,
  mode = "wardrobe",
  activeGroup,
  onGroup,
}: {
  today: LocalDate;
  mode?: "wardrobe" | "today";
  /** Il gruppo con cui è filtrato il catalogo, se c'è. */
  activeGroup?: WashGroup | "none" | null;
  onGroup?: (group: WashGroup | "none" | null) => void;
}) {
  const tz = useTimezone();
  const toast = useToast();
  const actions = useTaskActions(today, tz);
  const laundry = useLaundry(today);
  const [planning, setPlanning] = useState<LaundryGroupState | null>(null);

  if (!laundry.ready) return null;
  const proposals = mode === "today" ? laundry.proposals.filter((p) => pressing(p, today)) : laundry.proposals;
  const total = laundry.counts.reduce((n, c) => n + c.count, 0) + laundry.ungrouped.length;
  if (mode === "today" ? proposals.length === 0 : total === 0) return null;
  // Il gruppo toccato in "Da lavare" si può lavare o pianificare anche senza una proposta dell'app.
  const chosen =
    mode === "wardrobe" && activeGroup && activeGroup !== "none" && !proposals.some((p) => p.group === activeGroup) ? laundry.groupState(activeGroup) : null;
  const cards = chosen ? [...proposals, chosen] : proposals;

  function done(p: LaundryGroupState) {
    // Con una lavatrice in programma si completa quella: il foglio dei capi si apre da lì.
    if (p.planned) void actions.complete(p.planned);
    else requestLaundryDone({ group: p.group, taskId: null });
  }

  function snooze(p: LaundryGroupState) {
    laundry.snooze(p);
    toast({ message: `Lavatrice ${WASH_GROUP_OF[p.group]}: torna con altri capi`, actionLabel: "Annulla", onAction: () => laundry.unsnooze(p.group) });
  }

  async function savePlan(date: LocalDate, time: string | null): Promise<boolean> {
    const target = planning;
    if (!target) return false;
    try {
      await planLaundry(target.group, date, time);
    } catch {
      return false;
    }
    setPlanning(null);
    toast({ message: `Lavatrice ${WASH_GROUP_OF[target.group]}: ${relativeDay(date, today)}` });
    return true;
  }

  return (
    <section aria-label="Lavatrici" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-mono">{mode === "today" ? "Lavatrice" : "Da lavare"}</h2>
        {mode === "today" ? (
          <Link href="/lists/wardrobe" className="-my-2.5 -mr-2.5 flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text">
            Guardaroba
            <Icon name="chevronRight" size={14} />
          </Link>
        ) : null}
      </div>

      {mode === "wardrobe" ? (
        <div role="group" aria-label="Capi da lavare per gruppo" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          {laundry.counts.map(({ group, count }) => (
            <button key={group} type="button" aria-pressed={activeGroup === group} onClick={() => onGroup?.(activeGroup === group ? null : group)} className={chip(activeGroup === group)}>
              {WASH_GROUP_LABEL[group]}
              <span className="font-mono text-xs text-text-3">{count}</span>
            </button>
          ))}
          {laundry.ungrouped.length > 0 ? (
            <button type="button" aria-pressed={activeGroup === "none"} onClick={() => onGroup?.(activeGroup === "none" ? null : "none")} className={chip(activeGroup === "none")}>
              Senza gruppo
              <span className="font-mono text-xs text-text-3">{laundry.ungrouped.length}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "wardrobe" && !activeGroup && laundry.counts.length > 0 ? (
        <p className="text-xs text-text-3">Tocca un gruppo per vedere i capi e pianificare una lavatrice quando vuoi.</p>
      ) : null}

      {cards.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {cards.map((p) => {
            const planned = plannedText(p, today);
            return (
              <li key={p.group} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm text-text">
                    Lavatrice {WASH_GROUP_OF[p.group]}
                    {p.deadline ? <span className="text-text-2"> · {dueLabel(p.deadline, today)}</span> : null}
                  </p>
                  <p className="text-xs text-text-2">{detail(p)}</p>
                  {planned ? <p className="text-xs text-text-2">{planned.text}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => done(p)}>Fatta</Button>
                  {!planned || planned.late ? <Button onClick={() => setPlanning(p)}>Pianifica</Button> : null}
                  {!p.urgent && !p.planned && mode === "wardrobe" && p !== chosen ? (
                    <Button variant="quiet" onClick={() => snooze(p)}>
                      Non ora
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {cards.length > 0 && laundry.drying ? <p className="text-xs text-text-3">{laundry.drying}.</p> : null}

      {planning ? (
        <LaundryPlanSheet
          group={planning.group}
          count={planning.items.length}
          today={today}
          deadline={planning.deadline}
          days={laundry.weather.days}
          onSave={savePlan}
          onClose={() => setPlanning(null)}
        />
      ) : null}
    </section>
  );
}
