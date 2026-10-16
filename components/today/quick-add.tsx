"use client";

import { useRef, useState } from "react";
import { inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { createTask } from "@/lib/data/api";
import type { LocalDate } from "@/lib/dates/local";

/** Aggiunta in serie alla lista del giorno: si scrive il titolo e Invio. I dettagli si aggiungono toccando la riga. */
export function QuickAdd({ day, today, onDetails }: { day: LocalDate; today: LocalDate; onDetails: (title: string) => void }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const title = text.trim();

  async function add() {
    if (!title) return;
    // Il campo si svuota subito e resta attivo, pronto per la prossima.
    setText("");
    input.current?.focus();
    try {
      await createTask(
        { title, notes: null, date: day, time: null, duration_min: null, due_date: null, window_start: null, attention: "low", area_id: null },
        { kind: "none" },
        today,
      );
    } catch {
      toast({ message: "Non salvato. Riprova.", tone: "warn", actionLabel: "Riprova", onAction: () => setText(title) });
    }
  }

  return (
    <form
      data-tour="quick-add"
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <label htmlFor="today-add" className="sr-only">
        Aggiungi un&apos;attività
      </label>
      <input
        id="today-add"
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Aggiungi un'attività"
        autoComplete="off"
        enterKeyHint="done"
        className={inputClass}
      />
      {title ? (
        <button
          type="button"
          onClick={() => {
            setText("");
            onDetails(title);
          }}
          className="min-h-11 shrink-0 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
        >
          Dettagli
        </button>
      ) : null}
      <button
        type="submit"
        disabled={!title}
        aria-label="Aggiungi"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-fill text-on-accent transition-colors disabled:bg-transparent disabled:text-text-3"
      >
        <Icon name="plus" size={18} />
      </button>
    </form>
  );
}
