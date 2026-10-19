"use client";

import { useState } from "react";
import { Button } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { KindIcon } from "@/components/today/quiet-events";
import { useRangeEvents, useTimezone } from "@/lib/data/hooks";
import { answerArrival } from "@/lib/data/shipments";
import { useWishlistItems } from "@/lib/data/wishlist-hooks";
import { dueLabel, relativeDay, addDays, type LocalDate } from "@/lib/dates/local";
import { eventsForDay } from "@/lib/events/day";
import { RETURN_DAYS, askDays, shipmentKey, shipmentQuestions, type ShipmentAnswer, type ShipmentQuestion } from "@/lib/wishlist/shipments";

/** Risposte "Non è arrivato": una comodità del dispositivo. Se si perdono, la domanda torna e basta. */
const ASKED_KEY = "planner-shipment-asked";

function readAsked(): string[] {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeAsked(keys: string[]) {
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify(keys.slice(-60)));
  } catch {
    // Non salvato: la domanda tornerà alla prossima apertura.
  }
}

/**
 * Pacchi arrivati, in Oggi (D71, con D70): dal giorno dopo una spedizione chiede se va tutto bene.
 * Sì: l'articolo entra in Acquistati. Da restituire: un'attività entro due settimane. Ci penso più tardi:
 * l'articolo aspetta in Acquisti › Da decidere. Senza domande non mostra nulla.
 */
export function ShipmentFollowUp({ today }: { today: LocalDate }) {
  const tz = useTimezone();
  const toast = useToast();
  const days = askDays(today);
  const events = useRangeEvents(days[0], days[days.length - 1], tz).data;
  const items = useWishlistItems().data;
  const [asked, setAsked] = useState<string[]>(readAsked);
  // Proposte della wishlist scartate con "Non è questo", per questa apertura.
  const [unlinked, setUnlinked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  if (!events || !items) return null;
  const questions = shipmentQuestions(
    days.map((day) => ({ day, occurrences: eventsForDay(events.events, events.exceptions, day, tz) })),
    items,
    asked,
  );
  if (questions.length === 0) return null;

  function setRemembered(next: string[]) {
    setAsked(next);
    writeAsked(next);
  }

  async function answer(q: ShipmentQuestion, choice: ShipmentAnswer) {
    const match = q.match && !unlinked.includes(q.event.id) ? q.match : null;
    setBusy(q.event.id);
    let undo: () => Promise<void>;
    try {
      undo = await answerArrival({ item: match, name: match?.name ?? q.name, eventId: q.event.id, day: q.day }, choice, today);
    } catch {
      toast({ message: "Risposta non salvata. Riprova.", tone: "warn" });
      return;
    } finally {
      setBusy(null);
    }
    const message =
      choice === "keep"
        ? "Spostato in Acquistati"
        : choice === "return"
          ? `Restituzione in Oggi, ${dueLabel(addDays(today, RETURN_DAYS), today)}`
          : "Lo trovi in Acquisti, tra quelli da decidere";
    toast({ message, actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
  }

  function notArrived(q: ShipmentQuestion) {
    const key = shipmentKey(q.event.id, q.day);
    setRemembered([...asked, key]);
    toast({ message: "Va bene, non ti chiedo più di questo pacco", actionLabel: "Annulla", onAction: () => setRemembered(readAsked().filter((k) => k !== key)) });
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
                  «{q.name}» <span className="text-text-2">· {relativeDay(q.day, today)}</span>. È arrivato e va tutto bene?
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
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void answer(q, "keep")} disabled={disabled}>
                  Sì, lo tengo
                </Button>
                <Button onClick={() => void answer(q, "return")} disabled={disabled}>
                  Da restituire
                </Button>
                <Button onClick={() => void answer(q, "later")} disabled={disabled}>
                  Ci penso più tardi
                </Button>
                <Button variant="quiet" onClick={() => notArrived(q)} disabled={disabled}>
                  Non è arrivato
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
