"use client";

import { useState } from "react";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { useProfile, useTimezone, useToday } from "@/lib/data/hooks";
import { answerDoses } from "@/lib/data/medicines";
import { useMedicineDoses, useMedicines } from "@/lib/data/medicines-hooks";
import { localTimeString, type LocalDate } from "@/lib/dates/local";
import { namesList, slotPhrase, slotTimes, snoozeOptions, todayMedicines, type DueDose, type SlotGroup } from "@/lib/medicines/schedule";
import type { MedicineDose, MedicineDoseStatus, MedicineKind } from "@/lib/supabase/types";

export function KindMark({ kind, size = 14 }: { kind: MedicineKind; size?: number }) {
  return <Icon name={kind === "supplement" ? "leaf" : "pill"} size={size} />;
}

/**
 * Medicine in Oggi (D74, con D70). Dall'orario della mattina e della sera chiede cosa è stato preso:
 * "Prese tutte" con un tocco, oppure una per una; per ciò che resta "Ricordamelo" (tra 1 ora, 3 ore,
 * stasera o domattina) e, in "Altro", "Segna come saltata". Di ieri, una sola domanda: Sì o No.
 * Ogni risposta si annulla dal toast. Senza nulla da chiedere non mostra nulla.
 */
export function MedicineFollowUp({ today }: { today: LocalDate }) {
  const tz = useTimezone();
  const { now } = useToday(tz);
  const profile = useProfile();
  const medicines = useMedicines().data;
  const doses = useMedicineDoses(today).data;
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!medicines || !doses || medicines.length === 0) return null;
  const times = slotTimes(profile);
  const state = todayMedicines({ medicines, doses, today, now, tz, times });
  if (state.now.length === 0 && state.yesterday.length === 0 && state.waiting.length === 0) return null;

  async function answer(items: DueDose[], status: MedicineDoseStatus, message: string, remindAt: Date | null = null) {
    setBusy(true);
    let undo: () => Promise<void>;
    try {
      undo = await answerDoses(items, status, doses as MedicineDose[], remindAt);
    } catch {
      toast({ message: "Risposta non salvata. Riprova.", tone: "warn" });
      return;
    } finally {
      setBusy(false);
    }
    toast({ message, actionLabel: "Annulla", onAction: () => void undo().catch(() => {}) });
  }

  return (
    <section aria-label="Medicine" className="flex flex-col gap-2">
      <h2 className="label-mono">Medicine</h2>
      <ul className="flex flex-col gap-2">
        {state.yesterday.map((g) => (
          <YesterdayCard key={`${g.day}:${g.slot}`} group={g} today={today} busy={busy} onAnswer={answer} />
        ))}
        {state.now.map((g) => (
          <NowCard key={`${g.day}:${g.slot}`} group={g} today={today} now={now} tz={tz} times={times} busy={busy} onAnswer={answer} />
        ))}
      </ul>
      {state.waiting.length > 0 ? (
        <p className="text-[13px] text-text-3">
          {waitingText(state.waiting, tz)}
        </p>
      ) : null}
    </section>
  );
}

type AnswerFn = (items: DueDose[], status: MedicineDoseStatus, message: string, remindAt?: Date | null) => Promise<void>;

function waitingText(waiting: (DueDose & { remindAt: Date })[], tz: string): string {
  const byTime = new Map<string, string[]>();
  for (const w of waiting) {
    const time = localTimeString(w.remindAt, tz);
    byTime.set(time, [...(byTime.get(time) ?? []), w.medicine.name]);
  }
  return [...byTime].map(([time, names]) => `Te lo ricordo alle ${time}: ${namesList(names)}.`).join(" ");
}

function ItemName({ item }: { item: DueDose }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-text-3">
        <KindMark kind={item.medicine.kind} />
      </span>
      <span className="min-w-0 break-words">{item.medicine.name}</span>
    </span>
  );
}

/** Il momento di oggi: una per una o tutte insieme, poi Ricordamelo o (raramente) saltata. */
function NowCard({
  group,
  today,
  now,
  tz,
  times,
  busy,
  onAnswer,
}: {
  group: SlotGroup;
  today: LocalDate;
  now: Date;
  tz: string;
  times: { morning: string; evening: string };
  busy: boolean;
  onAnswer: AnswerFn;
}) {
  const [panel, setPanel] = useState<"none" | "snooze" | "more">("none");
  const { items, slot, day } = group;
  const one = items.length === 1;
  const phrase = slotPhrase(slot, day, today);

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <p className="text-sm">
        {phrase}: {one ? "l'hai presa?" : "le hai prese?"}
      </p>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.medicine.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAnswer([item], "taken", `${item.medicine.name}: presa`)}
              aria-label={`Segna come presa: ${item.medicine.name}`}
              className="-mx-1.5 flex min-h-11 w-[calc(100%+12px)] items-center gap-3 rounded-xl px-1.5 text-left text-[15px] hover:bg-surface-2 disabled:opacity-60"
            >
              <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-2" />
              <ItemName item={item} />
            </button>
          </li>
        ))}
      </ul>

      {panel === "snooze" ? (
        <div role="group" aria-label="Quando te lo ricordo?" className="flex flex-col gap-2">
          <p className="text-xs text-text-2">Quando te lo ricordo?</p>
          <div className="flex flex-wrap gap-2">
            {snoozeOptions(slot, now, today, tz, times).map((o) => (
              <Button
                key={o.label}
                disabled={busy}
                onClick={() => void onAnswer(items, "snoozed", `Te lo ricordo alle ${localTimeString(o.at, tz)}`, o.at)}
              >
                {o.label}
              </Button>
            ))}
            <Button variant="quiet" onClick={() => setPanel("none")}>
              Indietro
            </Button>
          </div>
        </div>
      ) : panel === "more" ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void onAnswer(items, "skipped", one ? "Segnata come saltata" : "Segnate come saltate")}>
            {one ? "Segna come saltata" : "Segna come saltate"}
          </Button>
          <Button variant="quiet" onClick={() => setPanel("none")}>
            Indietro
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void onAnswer(items, "taken", one ? "Segnata come presa" : "Segnate come prese")}>
            {one ? "Presa" : "Prese tutte"}
          </Button>
          <Button disabled={busy} onClick={() => setPanel("snooze")}>
            Ricordamelo
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => setPanel("more")}>
            Altro
          </Button>
        </div>
      )}
    </li>
  );
}

/** Ieri senza risposta: Sì o No, una volta sola. "No" la segna come saltata. */
function YesterdayCard({ group, today, busy, onAnswer }: { group: SlotGroup; today: LocalDate; busy: boolean; onAnswer: AnswerFn }) {
  const { items, slot, day } = group;
  const phrase = slotPhrase(slot, day, today);
  if (items.length === 1) {
    const item = items[0];
    return (
      <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <span>{phrase}: hai preso</span>
          <ItemName item={item} />
          <span>?</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void onAnswer(items, "taken", "Segnata come presa")}>
            Sì
          </Button>
          <Button disabled={busy} onClick={() => void onAnswer(items, "skipped", "Segnata come saltata")}>
            No
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <p className="text-sm">{phrase}: le hai prese?</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.medicine.id} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
            <ItemName item={item} />
            <span className="flex gap-1.5">
              <Button disabled={busy} onClick={() => void onAnswer([item], "taken", `${item.medicine.name}: presa`)}>
                <span className="sr-only">{item.medicine.name}: </span>Sì
              </Button>
              <Button disabled={busy} onClick={() => void onAnswer([item], "skipped", `${item.medicine.name}: saltata`)}>
                <span className="sr-only">{item.medicine.name}: </span>No
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void onAnswer(items, "taken", "Segnate come prese")}>
          Sì, tutte
        </Button>
      </div>
    </li>
  );
}
