"use client";

import { useState } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deleteMedicine, saveMedicine } from "@/lib/data/medicines";
import { useShoppingActions } from "@/lib/data/shopping-hooks";
import { relativeDay, weekdayName, type LocalDate } from "@/lib/dates/local";
import {
  KIND_LABEL,
  SLOT_LABEL,
  WEEKDAY_SHORT,
  cleanDraft,
  draftProblem,
  history,
  type HistoryState,
  type MedicineDraft,
} from "@/lib/medicines/schedule";
import type { Medicine, MedicineDose, MedicineKind, MedicineSchedule } from "@/lib/supabase/types";

const STATE_LABEL: Record<HistoryState, string> = { taken: "presa", skipped: "saltata", none: "senza risposta" };

function emptyDraft(today: LocalDate): MedicineDraft {
  return { name: "", kind: "medicine", morning: true, evening: false, schedule: "daily", weekdays: [], cycle_on: 1, cycle_off: 1, start_date: today, end_date: null };
}

/**
 * Scheda di una medicina o di un integratore (D74): nome, tipo, mattina e/o sera, ritmo
 * (tutti i giorni, certi giorni, a cicli di settimane), inizio e fine. Per una esistente anche
 * "Sta finendo" (la mette nella Spesa), lo storico giorno per giorno ed Elimina.
 */
export function MedicineSheet({
  medicine,
  doses,
  today,
  onClose,
}: {
  medicine: Medicine | null;
  doses: MedicineDose[];
  today: LocalDate;
  onClose: () => void;
}) {
  const toast = useToast();
  const shopping = useShoppingActions();
  const [draft, setDraft] = useState<MedicineDraft>(() =>
    medicine
      ? { name: medicine.name, kind: medicine.kind, morning: medicine.morning, evening: medicine.evening, schedule: medicine.schedule, weekdays: medicine.weekdays, cycle_on: medicine.cycle_on ?? 1, cycle_off: medicine.cycle_off ?? 1, start_date: medicine.start_date, end_date: medicine.end_date }
      : emptyDraft(today),
  );
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const set = (patch: Partial<MedicineDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const problem = draftProblem(draft);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problem) return;
    try {
      await saveMedicine(cleanDraft(draft), medicine);
    } catch {
      toast({ message: "Non salvata. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: medicine ? "Salvata" : `${KIND_LABEL[draft.kind]} aggiunta` });
    onClose();
  }

  async function remove() {
    if (!medicine) return;
    try {
      await deleteMedicine(medicine);
    } catch {
      toast({ message: "Non eliminata. Riprova.", tone: "warn" });
      return;
    }
    toast({ message: `${medicine.name} eliminata` });
    onClose();
  }

  const days = medicine ? history(medicine, doses, today) : [];
  const shown = showAll ? days : days.slice(0, 7);

  return (
    <Sheet title={medicine ? medicine.name : "Nuova medicina"} isOpen onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Nome" htmlFor="med-name">
          <input
            id="med-name"
            className={inputClass}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Es. Vitamina D, Magnesio"
            autoComplete="off"
            autoFocus={!medicine}
          />
        </Field>

        <Segmented<MedicineKind>
          label="Tipo"
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "medicine", label: "Medicina" },
            { value: "supplement", label: "Integratore" },
          ]}
        />

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs text-text-2">Quando</legend>
          <div className="flex gap-2">
            {(["morning", "evening"] as const).map((slot) => (
              <button
                key={slot}
                type="button"
                aria-pressed={draft[slot]}
                onClick={() => set({ [slot]: !draft[slot] })}
                className={`min-h-11 flex-1 rounded-xl border text-sm transition-colors ${
                  draft[slot] ? "border-accent bg-accent-soft text-text" : "border-line-2 text-text-2 hover:bg-surface-2"
                }`}
              >
                {SLOT_LABEL[slot]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs text-text-2">Ritmo</legend>
          <Segmented<MedicineSchedule>
            label="Ritmo"
            value={draft.schedule}
            onChange={(schedule) => set({ schedule })}
            options={[
              { value: "daily", label: "Tutti i giorni" },
              { value: "weekdays", label: "Certi giorni" },
              { value: "cycle", label: "A cicli" },
            ]}
          />
          {draft.schedule === "weekdays" ? (
            <div role="group" aria-label="Giorni della settimana" className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((label, i) => {
                const day = i + 1;
                const on = draft.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ weekdays: on ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day] })}
                    className={`min-h-11 min-w-11 rounded-xl border px-2 text-sm transition-colors ${
                      on ? "border-accent bg-accent-soft text-text" : "border-line-2 text-text-2 hover:bg-surface-2"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {draft.schedule === "cycle" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-3">
                <Field label="Settimane sì" htmlFor="med-on">
                  <input id="med-on" type="number" inputMode="numeric" min={1} max={52} className={inputClass} value={draft.cycle_on ?? ""} onChange={(e) => set({ cycle_on: e.target.value ? Math.min(52, Math.max(1, Number(e.target.value))) : null })} />
                </Field>
                <Field label="Settimane no" htmlFor="med-off">
                  <input id="med-off" type="number" inputMode="numeric" min={1} max={52} className={inputClass} value={draft.cycle_off ?? ""} onChange={(e) => set({ cycle_off: e.target.value ? Math.min(52, Math.max(1, Number(e.target.value))) : null })} />
                </Field>
              </div>
              <p className="text-xs text-text-3">Le settimane si contano dalla data di inizio, che apre una settimana «sì».</p>
            </div>
          ) : null}
        </fieldset>

        <div className="flex gap-3">
          <Field label="Dal" htmlFor="med-start">
            <input id="med-start" type="date" required className={inputClass} value={draft.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="Al (facoltativo)" htmlFor="med-end">
            <input id="med-end" type="date" min={draft.start_date} className={inputClass} value={draft.end_date ?? ""} onChange={(e) => set({ end_date: e.target.value || null })} />
          </Field>
        </div>

        {tried && problem ? (
          <p role="alert" className="text-sm text-gold">
            {problem}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            {medicine ? "Salva" : "Aggiungi"}
          </Button>
          {medicine ? (
            <Button onClick={() => void shopping.add(medicine.name).then((ok) => ok && toast({ message: `${medicine.name} è nella Spesa` }))}>
              Sta finendo
            </Button>
          ) : null}
        </div>
      </form>

      {medicine ? (
        <section aria-label="Storico" className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="label-mono">Storico</h3>
          {days.length === 0 ? (
            <p className="text-sm text-text-3">Ancora nessun giorno.</p>
          ) : (
            <ul className="flex flex-col">
              {shown.map((h) => (
                <li key={h.day} className="flex min-h-9 items-center justify-between gap-3 text-sm">
                  <span className="text-text-2">
                    {h.day === today ? "Oggi" : relativeDay(h.day, today) === "ieri" ? "Ieri" : `${weekdayName(h.day).slice(0, 3)} ${h.day.slice(8).replace(/^0/, "")}`}
                  </span>
                  <span className="flex flex-wrap justify-end gap-x-3">
                    {h.slots.map((s) => (
                      <span key={s.slot} className={s.state === "taken" ? "text-text" : "text-text-3"}>
                        {medicine.morning && medicine.evening ? `${SLOT_LABEL[s.slot]}: ` : ""}
                        {STATE_LABEL[s.state]}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {days.length > 7 && !showAll ? (
            <button type="button" onClick={() => setShowAll(true)} className="-ml-2.5 min-h-11 self-start rounded-lg px-2.5 text-[13px] text-accent hover:bg-surface-2">
              Mostra 30 giorni
            </button>
          ) : null}
        </section>
      ) : null}

      {medicine ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {confirmDelete ? (
            <>
              <p className="w-full text-sm text-text-2">Si cancella anche lo storico.</p>
              <Button onClick={() => void remove()}>Elimina</Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              Elimina
            </Button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
