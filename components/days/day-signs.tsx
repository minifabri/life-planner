"use client";

import { useState } from "react";
import { BicepsFlexed, Briefcase, Plane, type LucideIcon } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { toggleDayMark } from "@/lib/data/day-marks";
import { useDayContext } from "@/lib/data/day-marks-hooks";
import { addDays, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";
import { MARK_KINDS, SIGN_LABEL, daySigns, dayWorkouts, signsText, workoutLabel, type DaySign } from "@/lib/days/marks";
import type { DayMark, Workout } from "@/lib/supabase/types";

const SIGN_ICON: Record<DaySign, LucideIcon> = { office: Briefcase, travel: Plane, workout: BicepsFlexed };

export function SignIcon({ sign, size = 12 }: { sign: DaySign; size?: number }) {
  const Glyph = SIGN_ICON[sign];
  return <Glyph size={size} strokeWidth={1.6} aria-hidden focusable={false} className="shrink-0" />;
}

/**
 * I segni di un giorno come piccole icone grigie, senza testo: chi le mostra li nomina nella propria etichetta.
 * L'altezza è fissa, così una striscia di giorni resta allineata anche dove non c'è niente.
 */
export function DaySigns({ signs, size = 11, className = "" }: { signs: DaySign[]; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`flex items-center gap-[3px] text-text-3 ${className}`} style={{ height: size }}>
      {signs.map((sign) => (
        <SignIcon key={sign} sign={sign} size={size} />
      ))}
    </span>
  );
}

function dayLabel(day: LocalDate, today: LocalDate) {
  return day === today ? "oggi" : `${weekdayName(day)} ${shortDate(day)}`;
}

/** Foglio per segnare un giorno: ufficio e viaggio si mettono e si tolgono con un tocco. */
export function DayMarksSheet({
  day,
  today,
  marks,
  workouts,
  onClose,
}: {
  day: LocalDate;
  today: LocalDate;
  marks: DayMark[];
  workouts: Workout[];
  onClose: () => void;
}) {
  const toast = useToast();
  const training = dayWorkouts(workouts, day, today);

  async function toggle(kind: DayMark["kind"]) {
    try {
      await toggleDayMark(marks, day, kind);
    } catch {
      toast({ message: "Modifica non salvata. Riprova.", tone: "warn" });
    }
  }

  return (
    <Sheet title={`Segna ${dayLabel(day, today)}`} isOpen onClose={onClose}>
      <div role="group" aria-label="Segni del giorno" className="flex gap-2">
        {MARK_KINDS.map((kind) => {
          const active = marks.some((m) => m.date === day && m.kind === kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => void toggle(kind)}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
              }`}
            >
              <SignIcon sign={kind} size={16} />
              {SIGN_LABEL[kind]}
            </button>
          );
        })}
      </div>
      {training.length > 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-text-3">
          <SignIcon sign="workout" size={14} />
          <span>
            <span className="sr-only">Allenamento: </span>
            {training.map(workoutLabel).join(" · ")}
          </span>
        </p>
      ) : null}
    </Sheet>
  );
}

/**
 * Riga discreta sotto il titolo di un giorno: dice com'è fatto ("Ufficio · Corsa 18:00") e apre il foglio per segnarlo.
 * Senza `workouts` mostra solo i segni messi a mano (dove gli allenamenti si vedono già).
 */
export function DayMarksLine({
  day,
  today,
  marks,
  workouts = [],
  className = "",
}: {
  day: LocalDate;
  today: LocalDate;
  marks: DayMark[];
  workouts?: Workout[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const kinds = MARK_KINDS.filter((kind) => marks.some((m) => m.date === day && m.kind === kind));
  const training = dayWorkouts(workouts, day, today);
  const empty = kinds.length + training.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={empty ? `Segna ${dayLabel(day, today)}` : undefined}
        className={`-ml-2.5 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-lg px-2.5 text-left text-[13px] text-text-3 hover:bg-surface-2 hover:text-text-2 ${className}`}
      >
        {empty ? (
          "Segna il giorno"
        ) : (
          <>
            <span className="sr-only">Segni del giorno, tocca per cambiarli: </span>
            {kinds.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <SignIcon sign={kind} size={13} />
                {SIGN_LABEL[kind]}
              </span>
            ))}
            {training.map((w) => (
              <span key={w.id} className="flex items-center gap-1.5">
                <SignIcon sign="workout" size={13} />
                <span className="sr-only">Allenamento: </span>
                {workoutLabel(w)}
              </span>
            ))}
          </>
        )}
      </button>
      {open ? <DayMarksSheet day={day} today={today} marks={marks} workouts={workouts} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * I prossimi sette giorni, da oggi, con i loro segni: per le sezioni che non hanno un calendario (Guardaroba).
 * Un tocco su un giorno apre il foglio per segnarlo.
 */
export function UpcomingDays({ today, tour }: { today: LocalDate; tour?: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const { marks, workouts } = useDayContext(today, days[6]);
  const [picked, setPicked] = useState<LocalDate | null>(null);

  return (
    <>
      <nav aria-label="I prossimi giorni" data-tour={tour} className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const signs = daySigns(d, marks, workouts, today);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(d)}
              aria-label={`${dayLabel(d, today)}: ${signsText(signs) || "nessun segno"}. Segna il giorno`}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[13px] text-text-2 hover:bg-surface-2"
            >
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">{weekdayName(d).slice(0, 3)}</span>
              <span className={d === today ? "text-accent" : undefined}>{Number(d.slice(8))}</span>
              <DaySigns signs={signs} />
            </button>
          );
        })}
      </nav>
      {picked ? <DayMarksSheet day={picked} today={today} marks={marks} workouts={workouts} onClose={() => setPicked(null)} /> : null}
    </>
  );
}
