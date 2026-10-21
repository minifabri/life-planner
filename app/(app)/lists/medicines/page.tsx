"use client";

import { useState } from "react";
import { KindMark } from "@/components/medicines/medicine-followup";
import { MedicineSheet } from "@/components/medicines/medicine-sheet";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useProfile, useTimezone, useToday } from "@/lib/data/hooks";
import { answerDoses, clearDose } from "@/lib/data/medicines";
import { useMedicineDoses, useMedicines } from "@/lib/data/medicines-hooks";
import { localTimeString, relativeDay } from "@/lib/dates/local";
import { SLOTS, SLOT_LABEL, doseIndex, doseKey, dueIn, isDueOn, nextDueDay, phaseOf, scheduleSummary, slotTimes, type DueDose } from "@/lib/medicines/schedule";
import type { Medicine, MedicineDose } from "@/lib/supabase/types";

/**
 * Medicine e integratori (D74), dentro Liste. In cima ciò che va preso oggi, da segnare in qualsiasi momento
 * (le domande in Oggi arrivano all'orario della mattina e della sera); sotto l'elenco, con il ritmo di ognuna.
 */
export default function MedicinesPage() {
  const tz = useTimezone();
  const { today, now } = useToday(tz);
  const profile = useProfile();
  const medicinesQuery = useMedicines();
  const doses = useMedicineDoses(today).data ?? [];
  const toast = useToast();
  const [editing, setEditing] = useState<Medicine | "new" | null>(null);
  const [endedOpen, setEndedOpen] = useState(false);

  const medicines = medicinesQuery.data ?? [];
  const times = slotTimes(profile);
  const index = doseIndex(doses);
  const active = medicines.filter((m) => phaseOf(m, today) === "active");
  const upcoming = medicines.filter((m) => phaseOf(m, today) === "upcoming");
  const ended = medicines.filter((m) => phaseOf(m, today) === "ended");
  const todaySlots = SLOTS.map((slot) => ({ slot, items: dueIn(active, today, slot) })).filter((g) => g.items.length > 0);

  async function toggle(item: DueDose, dose: MedicineDose | undefined) {
    try {
      if (dose?.status === "taken") {
        await clearDose(item);
        toast({ message: `${item.medicine.name}: tolta la spunta` });
      } else {
        const undo = await answerDoses([item], "taken", doses);
        toast({ message: `${item.medicine.name}: presa`, actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
      }
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
    }
  }

  const card = (m: Medicine) => {
    const pause = phaseOf(m, today) === "active" && !isDueOn(m, today) ? nextDueDay(m, today) : null;
    return (
      <li key={m.id}>
        <button
          type="button"
          onClick={() => setEditing(m)}
          className="flex min-h-[60px] w-full items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
        >
          <span className="shrink-0 text-text-3">
            <KindMark kind={m.kind} size={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="break-words text-[15px]">{m.name}</span>
            <span className="text-xs text-text-3">
              {scheduleSummary(m, today)}
              {pause ? ` · in pausa, si riprende ${relativeDay(pause, today)}` : ""}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="shrink-0 text-text-3" />
        </button>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Liste"
        title="Medicine"
        muted={active.length > 0 ? String(active.length) : undefined}
        actions={
          <Button variant="primary" onClick={() => setEditing("new")} tour="medicines-add">
            Aggiungi
          </Button>
        }
      />

      {medicinesQuery.isError && medicinesQuery.data === undefined ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>Non riesco a caricare le medicine. Controlla la connessione.</p>
          <button type="button" onClick={() => medicinesQuery.refetch()} className="min-h-11 rounded-lg px-3 font-medium text-accent">
            Riprova
          </button>
        </div>
      ) : medicinesQuery.data === undefined ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico le medicine…
        </p>
      ) : medicines.length === 0 ? (
        <EmptyState
          title="Nessuna medicina."
          hint="Aggiungi medicine e integratori, la mattina, la sera o tutte e due: all'orario Oggi ti chiede se li hai presi."
        />
      ) : null}

      {todaySlots.length > 0 ? (
        <section aria-label="Oggi" data-tour="medicines-today" className="flex flex-col gap-2">
          <h2 className="label-mono">Oggi</h2>
          <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
            {todaySlots.map((g) => (
              <div key={g.slot} className="flex flex-col">
                <h3 className="text-xs text-text-2">
                  {SLOT_LABEL[g.slot]} · {times[g.slot]}
                </h3>
                <ul className="flex flex-col">
                  {g.items.map((item) => {
                    const dose = index.get(doseKey(item.medicine.id, item.day, item.slot));
                    const taken = dose?.status === "taken";
                    const note =
                      dose?.status === "skipped"
                        ? "saltata"
                        : dose?.status === "snoozed" && dose.remind_at
                          ? new Date(dose.remind_at) > now
                            ? `te lo ricordo alle ${localTimeString(new Date(dose.remind_at), tz)}`
                            : "da segnare"
                          : null;
                    return (
                      <li key={item.medicine.id}>
                        <button
                          type="button"
                          aria-pressed={taken}
                          onClick={() => void toggle(item, dose)}
                          className="-mx-1.5 flex min-h-11 w-[calc(100%+12px)] items-center gap-3 rounded-xl px-1.5 text-left text-[15px] hover:bg-surface-2"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                              taken ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
                            }`}
                          >
                            <Icon name="check" size={14} strokeWidth={2.2} />
                          </span>
                          <span className={`min-w-0 flex-1 break-words ${taken ? "text-text-2" : ""}`}>
                            <span className="sr-only">{taken ? "Presa: " : "Da prendere: "}</span>
                            {item.medicine.name}
                          </span>
                          {note ? <span className="shrink-0 text-xs text-text-3">{note}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section aria-label="In corso" data-tour="medicines-list" className="flex flex-col gap-2">
          <h2 className="label-mono">In corso</h2>
          <ul className="flex flex-col gap-2">{active.map(card)}</ul>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section aria-label="Da iniziare" className="flex flex-col gap-2">
          <h2 className="label-mono">Da iniziare</h2>
          <ul className="flex flex-col gap-2">{upcoming.map(card)}</ul>
        </section>
      ) : null}

      {ended.length > 0 ? (
        <section aria-label="Finite" className="flex flex-col">
          <h2>
            <button
              type="button"
              aria-expanded={endedOpen}
              onClick={() => setEndedOpen((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-dashed border-line-2 px-3.5 text-sm text-text-2 hover:text-text"
            >
              <span>Finite · {ended.length}</span>
              <Icon name="chevronRight" size={16} className={`transition-transform ${endedOpen ? "rotate-90" : ""}`} />
            </button>
          </h2>
          {endedOpen ? <ul className="flex flex-col gap-2 pt-2">{ended.map(card)}</ul> : null}
        </section>
      ) : null}

      {editing ? (
        <MedicineSheet
          key={editing === "new" ? "new" : editing.id}
          medicine={editing === "new" ? null : editing}
          doses={doses}
          today={today}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
