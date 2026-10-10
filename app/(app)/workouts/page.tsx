"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { WorkoutRow } from "@/components/workouts/workout-row";
import { WorkoutSheet, type WorkoutTarget } from "@/components/workouts/workout-sheet";
import { useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { HISTORY_WEEKS, useRecentWorkouts, useWorkoutActions } from "@/lib/data/workouts-hooks";
import { relativeDay, shortDate, weekStart, weekdayName } from "@/lib/dates/local";
import { groupByWeek, summaryLabel } from "@/lib/workouts/summary";

export default function WorkoutsPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const query = useRecentWorkouts(today);
  const actions = useWorkoutActions();
  const offline = useOffline();
  const [sheet, setSheet] = useState<WorkoutTarget | null>(null);

  const weeks = groupByWeek(query.data ?? []);
  const thisWeek = weekStart(today);
  const failed = query.data === undefined && (offline || query.isError);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <Link href="/today" className="-ml-2.5 -mb-3 flex min-h-11 items-center gap-1 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text">
        <Icon name="chevronLeft" size={16} />
        Oggi
      </Link>
      <PageHeader
        eyebrow={`Ultime ${HISTORY_WEEKS} settimane`}
        title="Allenamenti"
        actions={
          <Button variant="primary" onClick={() => setSheet({ kind: "new", day: today })}>
            Aggiungi
          </Button>
        }
      />

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "Lo storico non è disponibile senza rete." : "Non riesco a caricare gli allenamenti. Controlla la connessione."}</p>
          <button type="button" onClick={() => query.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
            Riprova
          </button>
        </div>
      ) : query.data === undefined ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico gli allenamenti…
        </p>
      ) : weeks.length === 0 ? (
        <EmptyState title="Ancora nessun allenamento." hint="Aggiungine uno qui, oppure scrivi “corsa domani 45 min” nel Quick Capture." />
      ) : (
        weeks.map((week) => (
          <section key={week.from} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="label-mono">
                {week.from === thisWeek ? "Questa settimana" : `${Number(week.from.slice(8))}–${shortDate(week.to)}`}
              </h2>
              <span className="text-xs text-text-3">
                <span className="sr-only">Fatti: </span>
                {summaryLabel(week.summary)}
              </span>
            </div>
            <ul className="flex flex-col">
              {week.workouts.map((w) => (
                <WorkoutRow
                  key={w.id}
                  workout={w}
                  today={today}
                  meta={week.from === thisWeek ? relativeDay(w.date, today) : `${weekdayName(w.date).slice(0, 3)} ${shortDate(w.date)}`}
                  onToggle={() => actions.toggle(w)}
                  onOpen={() => setSheet({ kind: "edit", workout: w })}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {sheet ? (
        <WorkoutSheet key={sheet.kind === "edit" ? sheet.workout.id : "new"} target={sheet} today={today} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}
