"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Segmented } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useInvalidateDay } from "@/lib/data/hooks";
import { lessonPrepQuery, setLessonToPrep } from "@/lib/data/lessons";
import { localTimeString, relativeDay, shortDate, weekdayName, type LocalDate } from "@/lib/dates/local";
import { localDateString } from "@/lib/dates/today";
import type { Occurrence } from "@/lib/events/day";
import type { LessonDetails } from "@/lib/imayoga/map";
import { bookedSummary, prepDate, prepState } from "@/lib/imayoga/prep";

function Names({ title, names }: { title: string; names: string[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="label-mono">{title}</h3>
      <ul className="flex flex-col">
        {names.map((name, i) => (
          <li key={`${name}-${i}`} className="border-b border-line py-2 text-[15px] last:border-b-0">
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bookings({ lesson }: { lesson: LessonDetails }) {
  if (lesson.individual) {
    const who = lesson.assigned ?? lesson.booked[0];
    return who ? <Names title="Con" names={[who]} /> : null;
  }
  return (
    <>
      {lesson.booked.length ? (
        <Names title={`Prenotati · ${bookedSummary(lesson)}`} names={lesson.booked} />
      ) : (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono">Prenotati</h3>
          <p className="text-sm text-text-2">
            Nessuna prenotazione per ora{lesson.capacity ? ` (${lesson.capacity} posti)` : ""}.
          </p>
        </section>
      )}
      {lesson.waitlist.length ? <Names title={`Lista d’attesa · ${lesson.waitlist.length}`} names={lesson.waitlist} /> : null}
    </>
  );
}

/** Dettaglio di una lezione arrivata da imayoga: chi ha prenotato e se è da preparare. */
export function LessonSheet({ occurrence, today, onClose }: { occurrence: Occurrence; today: LocalDate; onClose: () => void }) {
  const event = occurrence.event;
  const prep = useQuery(lessonPrepQuery(event.id));
  const invalidate = useInvalidateDay();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = occurrence.start;
  const day = start ? localDateString(start, event.tz) : null;
  const when = start && day
    ? `${weekdayName(day)} ${shortDate(day)} · ${localTimeString(start, event.tz)}${occurrence.end ? `–${localTimeString(occurrence.end, event.tz)}` : ""}`
    : null;

  const state = prepState(prep.data);
  const canPrepare = !!day && prepDate(day, today) !== null;

  async function setToPrep(toPrep: boolean) {
    if (busy || toPrep === (state !== "none")) return;
    setBusy(true);
    setError(null);
    try {
      await setLessonToPrep(event, toPrep, today);
      invalidate();
    } catch {
      setError("Non è stato possibile salvare. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Lezione" isOpen onClose={onClose}>
      <div className="flex flex-col gap-1">
        <p className="text-[17px] leading-snug">{event.title}</p>
        {when ? <p className="text-sm text-text-2 first-letter:uppercase">{when}</p> : null}
        {event.location ? <p className="text-sm text-text-2">{event.location}</p> : null}
      </div>

      {event.lesson ? <Bookings lesson={event.lesson} /> : null}

      {prep.isSuccess && (canPrepare || state !== "none") ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono">Preparazione</h3>
          <Segmented
            label="Preparazione"
            value={state === "none" ? "ready" : "to_prep"}
            options={[
              { value: "ready", label: "Niente da preparare" },
              { value: "to_prep", label: "Da preparare" },
            ]}
            onChange={(value) => setToPrep(value === "to_prep")}
          />
          {state === "prepared" ? (
            <p className="text-xs text-text-3">Preparata.</p>
          ) : state === "to_prep" && prep.data?.date ? (
            <p className="text-xs text-text-3">La trovi tra le cose da fare di {relativeDay(prep.data.date, today)}.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-text-2">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}
