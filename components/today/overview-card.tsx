"use client";

import { RowAction } from "@/components/today/task-row";
import { Icon } from "@/components/ui/icon";
import { saveAnswer } from "@/lib/data/questions";
import { useAnswerMap, useImportOnce } from "@/lib/data/questions-hooks";
import { trimTime, type LocalDate } from "@/lib/dates/local";
import type { Task } from "@/lib/supabase/types";

/**
 * Ricorda il giorno in cui una card è stata chiusa: non riappare fino al giorno dopo, su nessun dispositivo.
 * Finché non si sa (risposte non ancora lette), la card resta nascosta: meglio che vederla sparire.
 */
export function useDismissedToday(key: string, today: LocalDate): [boolean, () => void] {
  const answers = useAnswerMap();
  const answerKey = `closed:${key}`;
  useImportOnce(async () => {
    // Le versioni precedenti salvavano sul dispositivo il giorno di chiusura, come testo.
    let day: string | null = null;
    try {
      day = localStorage.getItem(key);
      localStorage.removeItem(key);
    } catch {
      return;
    }
    if (day === today) await saveAnswer(answerKey, today, true);
  });
  function dismiss() {
    void saveAnswer(answerKey, today, true).catch(() => {});
  }
  return [!answers || answers.get(answerKey)?.answer === today, dismiss];
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-mt-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text"
    >
      <Icon name="close" size={16} />
    </button>
  );
}

/** Morning overview: una frase di sintesi in cima a Today (Product Definition 7.8). */
export function MorningOverview({ text, note, onClose }: { text: string; note: string | null; onClose: () => void }) {
  return (
    <section aria-label="Panoramica di oggi" className="flex items-start gap-1.5 rounded-[14px] bg-accent-soft py-3.5 pl-4 pr-1">
      <p className="flex-1 text-sm leading-relaxed">
        {text}
        {note ? <span className="text-text-2"> {note}</span> : null}
      </p>
      <CloseButton label="Chiudi la panoramica" onClick={onClose} />
    </section>
  );
}

/** Evening review: ciò che è rimasto aperto oggi, con Completa · Domani · Scegli data; il resto si lascia. */
export function EveningReview({
  heading,
  tasks,
  onComplete,
  onTomorrow,
  onPickDate,
  onClose,
}: {
  heading: string;
  tasks: Task[];
  onComplete: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onPickDate: (task: Task) => void;
  onClose: () => void;
}) {
  return (
    <section aria-label="Revisione della sera" className="flex flex-col rounded-[14px] bg-accent-soft py-3.5 pl-4 pr-1">
      <div className="flex items-start gap-1.5">
        <p className="flex-1 text-sm leading-relaxed">{heading}</p>
        <CloseButton label="Chiudi la revisione" onClick={onClose} />
      </div>
      {tasks.length > 0 ? (
        <>
          <ul className="flex flex-col pr-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-end gap-x-1 border-t border-line py-1">
                <span className="min-w-0 flex-1 basis-40 break-words py-2 text-[15px] leading-snug">
                  {t.title}
                  {t.time ? <span className="ml-2 font-mono text-xs text-text-3">{trimTime(t.time)}</span> : null}
                </span>
                <span className="flex shrink-0 items-center">
                  <RowAction label={`Completa: ${t.title}`} onClick={() => onComplete(t)}>
                    Completa
                  </RowAction>
                  <RowAction label={`Sposta a domani: ${t.title}`} onClick={() => onTomorrow(t)}>
                    Domani
                  </RowAction>
                  <RowAction label={`Scegli una data: ${t.title}`} onClick={() => onPickDate(t)}>
                    Scegli data
                  </RowAction>
                </span>
              </li>
            ))}
          </ul>
          <p className="pr-3 pt-1 text-xs leading-relaxed text-text-3">Quelle che lasci qui domani saranno tra le rimaste indietro.</p>
        </>
      ) : null}
    </section>
  );
}
