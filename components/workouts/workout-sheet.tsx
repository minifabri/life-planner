"use client";

import { useState, type ReactNode } from "react";
import { Button, Field, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useTimezone } from "@/lib/data/hooks";
import { createWorkout, removeWorkout, updateWorkout } from "@/lib/data/workouts";
import { useRecentWorkouts } from "@/lib/data/workouts-hooks";
import { atLocalTime, trimTime, type LocalDate } from "@/lib/dates/local";
import type { Workout, WorkoutStatus } from "@/lib/supabase/types";
import type { WorkoutInput } from "@/lib/workouts/convert";
import { activitySuggestions, parseKm } from "@/lib/workouts/summary";

export type WorkoutTarget =
  | { kind: "new"; day: LocalDate; draft?: Partial<{ activity: string; time: string; duration: string }> }
  | { kind: "edit"; workout: Workout };

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120];

function initialState(target: WorkoutTarget, today: LocalDate) {
  if (target.kind === "new") {
    return {
      activity: target.draft?.activity ?? "",
      date: target.day,
      time: target.draft?.time ?? "",
      duration: target.draft?.duration ?? "",
      // In un giorno già passato si sta annotando un allenamento fatto.
      status: (target.day < today ? "done" : "planned") as WorkoutStatus,
      km: "",
      kcal: "",
      hr: "",
      notes: "",
    };
  }
  const w = target.workout;
  return {
    activity: w.activity,
    date: w.date,
    time: w.time ? trimTime(w.time) : "",
    duration: w.duration_min ? String(w.duration_min) : "",
    status: w.status,
    km: w.distance_m ? String(w.distance_m / 1000).replace(".", ",") : "",
    kcal: w.energy_kcal ? String(w.energy_kcal) : "",
    hr: w.avg_hr ? String(w.avg_hr) : "",
    notes: w.notes ?? "",
  };
}

function wholeNumber(text: string): number | null {
  const n = Math.round(Number(text));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

/** Foglio per pianificare, annotare o modificare un allenamento. */
export function WorkoutSheet({
  target,
  today,
  onClose,
  header,
}: {
  target: WorkoutTarget;
  today: LocalDate;
  onClose: () => void;
  /** Contenuto sopra il modulo: la scelta del tipo, quando si arriva da "Aggiungi". */
  header?: ReactNode;
}) {
  const tz = useTimezone();
  const toast = useToast();
  const [f, setF] = useState(() => initialState(target, today));
  const [statusChosen, setStatusChosen] = useState(target.kind === "edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const suggestions = activitySuggestions(useRecentWorkouts(today).data ?? []);
  const workout = target.kind === "edit" ? target.workout : null;

  function set<K extends keyof typeof f>(key: K, value: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setDate(date: LocalDate) {
    // Finché lo stato non è stato scelto a mano segue il giorno: passato = fatto, da oggi in poi = pianificato.
    setF((prev) => ({ ...prev, date, status: statusChosen ? prev.status : date < today ? "done" : "planned" }));
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError("Non è stato possibile salvare. Riprova.");
      setBusy(false);
    }
  }

  function save() {
    const activity = f.activity.trim();
    if (!activity) {
      setError("Scrivi la disciplina.");
      return;
    }
    const completedAt =
      f.status !== "done"
        ? null
        : (workout?.completed_at ?? (f.date === today ? new Date() : atLocalTime(f.date, f.time || "12:00", tz)).toISOString());
    const input: WorkoutInput = {
      activity,
      date: f.date,
      time: f.time || null,
      duration_min: f.duration ? Number(f.duration) : null,
      notes: f.notes.trim() || null,
      status: f.status,
      completed_at: completedAt,
      distance_m: parseKm(f.km),
      energy_kcal: wholeNumber(f.kcal),
      avg_hr: wholeNumber(f.hr),
    };
    run(() => (workout ? updateWorkout(workout, input) : createWorkout(input)));
  }

  return (
    <Sheet title={workout ? "Modifica allenamento" : header ? "Aggiungi" : "Aggiungi allenamento"} isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {header}

        <Field label="Disciplina" htmlFor="workout-activity">
          <input
            id="workout-activity"
            list="workout-activities"
            autoFocus={!workout}
            value={f.activity}
            onChange={(e) => set("activity", e.target.value)}
            placeholder="Corsa, forza, pilates…"
            autoComplete="off"
            enterKeyHint="done"
            className={inputClass}
          />
          <datalist id="workout-activities">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <div className="flex gap-3">
          <Field label="Giorno" htmlFor="workout-date">
            <input id="workout-date" type="date" required value={f.date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ora (facoltativa)" htmlFor="workout-time">
            <input id="workout-time" type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Durata" htmlFor="workout-duration">
          <select id="workout-duration" value={f.duration} onChange={(e) => set("duration", e.target.value)} className={inputClass}>
            <option value="">Nessuna</option>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minuti` : d === 60 ? "1 ora" : d % 60 ? `${Math.floor(d / 60)} h ${d % 60}` : `${d / 60} ore`}
              </option>
            ))}
            {f.duration && !DURATIONS.includes(Number(f.duration)) ? <option value={f.duration}>{f.duration} minuti</option> : null}
          </select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-text-2">Stato</span>
          <Segmented
            label="Stato"
            value={f.status}
            onChange={(v) => {
              setStatusChosen(true);
              set("status", v);
            }}
            options={[
              { value: "planned", label: "In programma" },
              { value: "done", label: "Fatto" },
              { value: "skipped", label: "Saltato" },
            ]}
          />
        </div>

        <details className="group flex flex-col" open={!!workout}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-text-2 [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" size={15} className="transition-transform group-open:rotate-90" />
            Misure e note
          </summary>
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex gap-3">
              <Field label="Distanza (km)" htmlFor="workout-km">
                <input id="workout-km" inputMode="decimal" value={f.km} onChange={(e) => set("km", e.target.value)} autoComplete="off" className={inputClass} />
              </Field>
              <Field label="Calorie (kcal)" htmlFor="workout-kcal">
                <input id="workout-kcal" inputMode="numeric" value={f.kcal} onChange={(e) => set("kcal", e.target.value)} autoComplete="off" className={inputClass} />
              </Field>
              <Field label="Battito medio" htmlFor="workout-hr">
                <input id="workout-hr" inputMode="numeric" value={f.hr} onChange={(e) => set("hr", e.target.value)} autoComplete="off" className={inputClass} />
              </Field>
            </div>
            <Field label="Note" htmlFor="workout-notes">
              <textarea id="workout-notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} py-2.5`} />
            </Field>
            {workout?.source === "health" ? <p className="text-xs text-text-3">Questo allenamento arriva da Salute.</p> : null}
          </div>
        </details>

        {error ? (
          <p role="alert" className="text-sm text-gold">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={busy}>
          {workout ? "Salva" : "Aggiungi"}
        </Button>
      </form>

      {workout ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {!confirmDelete ? (
            <Button variant="quiet" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Elimina
            </Button>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await removeWorkout(workout);
                    toast({
                      message: "Allenamento eliminato",
                      actionLabel: "Annulla",
                      onAction: () => void updateWorkout(workout, { deleted_at: null }).catch(() => {}),
                    });
                  })
                }
              >
                Conferma eliminazione
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
