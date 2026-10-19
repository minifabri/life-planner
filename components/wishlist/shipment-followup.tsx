"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { KindIcon } from "@/components/today/quiet-events";
import { useRangeEvents, useTimezone } from "@/lib/data/hooks";
import { ANSWERS_KEY, fetchAnswers, importDeviceAnswers, saveAnswer } from "@/lib/data/questions";
import { answerArrival } from "@/lib/data/shipments";
import { useWishlistItems } from "@/lib/data/wishlist-hooks";
import { dueLabel, relativeDay, addDays, type LocalDate } from "@/lib/dates/local";
import { eventsForDay } from "@/lib/events/day";
import { RETURN_DAYS, askDays, shipmentKey, shipmentQuestions, waitKey, type ShipmentAnswer, type ShipmentQuestion } from "@/lib/wishlist/shipments";

/** Dove le versioni precedenti salvavano sul dispositivo le risposte "Non è arrivato". */
const DEVICE_ANSWERS_KEY = "planner-shipment-asked";

/**
 * Pacchi arrivati, in Oggi (D71, con D70): dal giorno della consegna chiede se va tutto bene.
 * Sì: l'articolo entra in Acquistati. Da restituire: un'attività entro due settimane. Ci penso più tardi:
 * l'articolo aspetta in Acquisti › Da decidere. Le risposte restano sul server, per tutti i dispositivi.
 * Senza domande non mostra nulla.
 */
export function ShipmentFollowUp({ today }: { today: LocalDate }) {
  const tz = useTimezone();
  const toast = useToast();
  const days = askDays(today);
  const events = useRangeEvents(days[0], days[days.length - 1], tz).data;
  const items = useWishlistItems().data;
  const answers = useQuery({ queryKey: ANSWERS_KEY, queryFn: fetchAnswers }).data;
  // Proposte della wishlist scartate con "Non è questo", per questa apertura.
  const [unlinked, setUnlinked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // "Da restituire" aperto: si sceglie cosa si restituisce (il nome è già scritto, si può accorciare).
  const [returning, setReturning] = useState<{ eventId: string; name: string } | null>(null);

  useEffect(() => {
    void importDeviceAnswers(DEVICE_ANSWERS_KEY, "not_arrived").catch(() => {});
  }, []);

  if (!events || !items || !answers) return null;
  const questions = shipmentQuestions(
    days.map((day) => ({ day, occurrences: eventsForDay(events.events, events.exceptions, day, tz) })),
    items,
    answers.map((a) => a.key),
    today,
  );
  if (questions.length === 0) return null;

  async function answer(q: ShipmentQuestion, choice: ShipmentAnswer, chosenName?: string) {
    const match = q.match && !unlinked.includes(q.event.id) ? q.match : null;
    const name = chosenName?.trim() || match?.name || q.name;
    setBusy(q.event.id);
    let undo: () => Promise<void>;
    try {
      undo = await answerArrival({ item: match, name, eventId: q.event.id, day: q.day }, choice, today);
    } catch {
      toast({ message: "Risposta non salvata. Riprova.", tone: "warn" });
      return;
    } finally {
      setBusy(null);
    }
    setReturning(null);
    const message =
      choice === "keep"
        ? "Spostato in Acquistati"
        : choice === "return"
          ? `Restituzione in Oggi, ${dueLabel(addDays(today, RETURN_DAYS), today)}`
          : "Lo trovi in Acquisti, tra quelli da decidere";
    toast({ message, actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
  }

  /** "Non è arrivato" (non chiede più di quel giorno) o, il giorno della consegna, "Non ancora" (si chiede di nuovo domani). */
  async function notArrived(q: ShipmentQuestion) {
    const key = q.today ? waitKey(q.event.id, today) : shipmentKey(q.event.id, q.day);
    let undo: () => Promise<void>;
    try {
      undo = await saveAnswer(key, q.today ? "not_yet" : "not_arrived");
    } catch {
      toast({ message: "Risposta non salvata. Riprova.", tone: "warn" });
      return;
    }
    toast({
      message: q.today ? "Va bene, te lo richiedo domani" : "Va bene, non ti chiedo più di questo pacco",
      actionLabel: "Annulla",
      onAction: () => void undo().catch(() => {}),
    });
  }

  return (
    <section aria-label="Pacchi arrivati" className="flex flex-col gap-2">
      <h2 className="label-mono">Pacchi arrivati</h2>
      <ul className="flex flex-col gap-2">
        {questions.map((q) => {
          const match = q.match && !unlinked.includes(q.event.id) ? q.match : null;
          const disabled = busy === q.event.id;
          return (
            <li key={q.event.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <p className="flex items-start gap-1.5 text-sm">
                <span className="mt-[3px] text-text-2">
                  <KindIcon kind="shipment" size={14} />
                </span>
                <span>
                  «{q.name}» <span className="text-text-2">· {relativeDay(q.day, today)}</span>. {q.today ? "È già arrivato? Va tutto bene?" : "È arrivato e va tutto bene?"}
                </span>
              </p>
              {match ? (
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-2">
                  <span>Dalla wishlist: «{match.name}»</span>
                  <button
                    type="button"
                    onClick={() => setUnlinked((u) => [...u, q.event.id])}
                    className="min-h-11 rounded-lg px-2 text-accent hover:bg-surface-2"
                  >
                    Non è questo
                  </button>
                </p>
              ) : null}
              {returning?.eventId === q.event.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (returning.name.trim()) void answer(q, "return", returning.name);
                  }}
                >
                  <Field label="Cosa restituisci? Se tieni il resto, lascia solo quello" htmlFor={`return-${q.event.id}`}>
                    <input
                      id={`return-${q.event.id}`}
                      className={inputClass}
                      value={returning.name}
                      onChange={(e) => setReturning({ eventId: q.event.id, name: e.target.value })}
                      autoFocus
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="primary" disabled={disabled || !returning.name.trim()}>
                      Da restituire
                    </Button>
                    <Button variant="quiet" onClick={() => setReturning(null)} disabled={disabled}>
                      Indietro
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void answer(q, "keep")} disabled={disabled}>
                    Sì, lo tengo
                  </Button>
                  <Button onClick={() => setReturning({ eventId: q.event.id, name: match?.name ?? q.name })} disabled={disabled}>
                    Da restituire
                  </Button>
                  <Button onClick={() => void answer(q, "later")} disabled={disabled}>
                    Ci penso più tardi
                  </Button>
                  <Button variant="quiet" onClick={() => void notArrived(q)} disabled={disabled}>
                    {q.today ? "Non ancora" : "Non è arrivato"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
