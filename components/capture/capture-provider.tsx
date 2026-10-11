"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import { ItemEditor, type EditorDraft } from "@/components/today/item-editor";
import { useToast } from "@/components/ui/toast";
import { describeDraft, planCapture, type CaptureDraft, type CapturePlan } from "@/lib/capture/plan";
import { createEvent, createTask, createWishlistItem, softDelete } from "@/lib/data/api";
import { createEntry } from "@/lib/data/log";
import { createShoppingItem } from "@/lib/data/shopping";
import { createWorkout } from "@/lib/data/workouts";
import { useRecentWorkouts } from "@/lib/data/workouts-hooks";
import { useInvalidateShopping } from "@/lib/data/shopping-hooks";
import { useInvalidateDay, useLogCategories, useTaskActions, useTimezone, useToday } from "@/lib/data/hooks";
import { endOfWeek, isoWeekday, localTimeString, type LocalDate } from "@/lib/dates/local";
import { WORKOUT_WORDS, activitySuggestions } from "@/lib/workouts/summary";

const CaptureContext = createContext<(text?: string) => void>(() => {});

/** Apre il Quick Capture da qualsiasi punto dell'app. */
export function useCapture() {
  return useContext(CaptureContext);
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.closest("input, textarea, select") !== null || target.isContentEditable);
}

/** Scrive ciò che è stato deciso e restituisce come annullarlo (null se non si può con un solo passo). */
async function write(plan: CapturePlan, today: LocalDate): Promise<(() => Promise<void>) | null> {
  switch (plan.kind) {
    case "task": {
      const id = await createTask(plan.input, plan.repeat, today);
      return plan.repeat.kind === "none" ? () => softDelete("tasks", id) : null;
    }
    case "event": {
      const id = await createEvent(plan.input);
      return () => softDelete("events", id);
    }
    case "workout": {
      const id = await createWorkout(plan.input);
      return () => softDelete("workouts", id);
    }
    case "shopping": {
      const id = await createShoppingItem(plan.name);
      return () => softDelete("shopping_items", id);
    }
    case "wishlist": {
      const id = await createWishlistItem(plan.name, plan.url);
      return () => softDelete("wishlist_items", id);
    }
    case "log": {
      const id = await createEntry({ ...plan.entry, notes: null, tags: [] });
      return () => softDelete("log_entries", id);
    }
  }
}

/** Ciò che il Quick Capture ha letto, come valori iniziali del modulo completo. */
function editorDraft(draft: CaptureDraft, today: LocalDate): EditorDraft {
  const date = draft.date ?? today;
  const repeat: EditorDraft["repeat"] = draft.repeat?.interval === 1 ? draft.repeat.freq : "none";
  const common = {
    title: draft.title,
    attention: draft.attention,
    date,
    repeat,
    weekDays: draft.repeat?.byDay ?? [isoWeekday(date)],
  };
  if (draft.kind === "event") {
    let endTime = "";
    if (draft.time && draft.durationMin) {
      const [h, m] = draft.time.split(":").map(Number);
      const end = (h * 60 + m + draft.durationMin) % 1440;
      endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    }
    return { ...common, type: "event", allDay: !draft.time, startTime: draft.time ?? "09:00", endTime };
  }
  const hasDay = !!draft.date || !!draft.time || repeat !== "none";
  return {
    ...common,
    type: "task",
    when: hasDay ? "day" : draft.windowEnd ? "window" : "none",
    time: draft.time ?? "",
    duration: draft.durationMin ? String(draft.durationMin) : "",
    due: draft.windowEnd ?? endOfWeek(today),
  };
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const tz = useTimezone();
  const { today, now } = useToday(tz);
  const categories = useLogCategories().data ?? [];
  const activities = activitySuggestions(useRecentWorkouts(today).data ?? [], WORKOUT_WORDS);
  const actions = useTaskActions(today, tz);
  const invalidateDay = useInvalidateDay();
  const invalidateShopping = useInvalidateShopping();
  const invalidate = () => {
    invalidateDay();
    invalidateShopping();
  };
  const toast = useToast();

  const [text, setText] = useState<string | null>(null);
  const [details, setDetails] = useState<EditorDraft | null>(null);

  const open = useCallback((initial = "") => {
    setDetails(null);
    setText(initial);
  }, []);

  // Desktop: N da qualsiasi schermata. ⌘K / Ctrl+K apre la command palette (components/search).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.metaKey || e.ctrlKey || document.querySelector("[role=dialog]")) return;
      if (e.key.toLowerCase() !== "n" || isTyping(e.target)) return;
      e.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function save(draft: CaptureDraft, original: string) {
    // L'interfaccia non aspetta il server: il foglio si chiude subito e l'esito arriva nel toast.
    setText(null);
    try {
      const undo = await write(planCapture(draft, today, tz), today);
      invalidate();
      toast({
        message: describeDraft(draft, today),
        actionLabel: undo ? "Annulla" : undefined,
        onAction: () => {
          undo?.()
            .then(invalidate)
            .catch(() => toast({ message: "Non è stato possibile annullare. Riprova da Oggi.", tone: "warn" }));
        },
      });
    } catch {
      // Niente va perso: "Riprova" riapre il foglio con il testo scritto.
      // Senza rete si arriva qui solo per le registrazioni riservate, che non si salvano sul dispositivo.
      toast({
        message: navigator.onLine ? "Non salvato. Riprova." : "Per questa registrazione serve la connessione.",
        tone: "warn",
        actionLabel: "Riprova",
        onAction: () => open(original),
      });
    }
  }

  return (
    <CaptureContext.Provider value={open}>
      {children}
      {text !== null ? (
        <CaptureSheet
          initialText={text}
          today={today}
          now={localTimeString(now, tz)}
          categories={categories}
          activities={activities}
          onClose={() => setText(null)}
          onSave={save}
          onDetails={(draft) => {
            setText(null);
            setDetails(editorDraft(draft, today));
          }}
        />
      ) : null}
      {details ? (
        <ItemEditor
          target={{ kind: "new", day: today, draft: details }}
          today={today}
          tz={tz}
          onClose={() => setDetails(null)}
          onDeleteTask={actions.remove}
        />
      ) : null}
    </CaptureContext.Provider>
  );
}
