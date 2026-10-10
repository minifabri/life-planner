"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CaptureSheet } from "@/components/capture/capture-sheet";
import { ItemEditor, type EditorDraft } from "@/components/today/item-editor";
import { useToast } from "@/components/ui/toast";
import { describeDraft, planCapture, type CaptureDraft, type CapturePlan } from "@/lib/capture/plan";
import { createEvent, createLogEntry, createTask, createWishlistItem, softDelete } from "@/lib/data/api";
import { createShoppingItem } from "@/lib/data/shopping";
import { useInvalidateShopping } from "@/lib/data/shopping-hooks";
import { useInvalidateDay, useLogCategories, useTaskActions, useTimezone, useToday } from "@/lib/data/hooks";
import { endOfWeek, isoWeekday, localTimeString, type LocalDate } from "@/lib/dates/local";

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
    case "shopping": {
      const id = await createShoppingItem(plan.name);
      return () => softDelete("shopping_items", id);
    }
    case "wishlist": {
      const id = await createWishlistItem(plan.name, plan.url);
      return () => softDelete("wishlist_items", id);
    }
    case "log": {
      const id = await createLogEntry(plan.entry);
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

  // Desktop: N oppure ⌘K / Ctrl+K, da qualsiasi schermata.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || document.querySelector("[role=dialog]")) return;
      const key = e.key.toLowerCase();
      const palette = (e.metaKey || e.ctrlKey) && key === "k";
      const direct = !e.metaKey && !e.ctrlKey && key === "n" && !isTyping(e.target);
      if (!palette && !direct) return;
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
      toast({
        message: "Non salvato. Controlla la connessione.",
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
