"use client";

import { useRef, useState, type ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { KIND_LABEL, destinationLabel, isBirthday, quickDays, whenLabel, type CaptureDraft } from "@/lib/capture/plan";
import { formatDuration, type LocalDate } from "@/lib/dates/local";
import { parseCapture, type CaptureKind } from "@/lib/parser/parse";
import { describeRule } from "@/lib/recurrence/rule";
import type { Attention, LogCategory } from "@/lib/supabase/types";

/** Campi che un chip può correggere: vincono su ciò che legge il parser. */
type Overrides = Partial<
  Pick<CaptureDraft, "kind" | "date" | "windowEnd" | "time" | "durationMin" | "attention" | "repeat" | "categoryId">
>;

type Panel = "kind" | "when" | "time" | "duration" | "category";

const KINDS: CaptureKind[] = ["task", "event", "workout", "shopping", "wishlist", "log"];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const NEXT_ATTENTION: Record<Attention, Attention> = { low: "medium", medium: "high", high: "low" };
const ATTENTION_LABEL: Record<Attention, string> = { low: "bassa", medium: "media", high: "alta" };
const EXAMPLES = ["domani alle 20 mettere in ammollo i ceci", "dentista martedì alle 15", "corsa domani 45 min", "comprare tofu"];
const PREFIXES = ["spesa:", "wish:", "log:"];

/** I chip non rubano il fuoco al campo di testo: su iPhone la tastiera resta aperta. */
function keepFocus(e: React.MouseEvent) {
  e.preventDefault();
}

const captionClass = "font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-3";

function Chip({
  children,
  caption,
  onPress,
  label,
  expanded,
  tone = "set",
}: {
  children: ReactNode;
  /** Nome del campo, in piccolo prima del valore. */
  caption?: string;
  onPress: () => void;
  /** Testo per gli screen reader, quando il contenuto visibile non basta. */
  label?: string;
  expanded?: boolean;
  tone?: "set" | "empty" | "unsure" | "gold";
}) {
  const styles = {
    set: "border-transparent bg-accent-soft text-text",
    empty: "border-dashed border-line-2 text-text-3",
    unsure: "border-dashed border-accent bg-accent-soft text-text",
    gold: "border-gold text-gold",
  }[tone];
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onPress}
      aria-label={label}
      aria-expanded={expanded}
      className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] ${styles} ${expanded ? "outline-1 outline-accent" : ""}`}
    >
      {caption ? <span className={captionClass}>{caption}</span> : null}
      {children}
    </button>
  );
}

function Option({ children, selected, onPress }: { children: ReactNode; selected?: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onPress}
      aria-pressed={selected}
      className={`min-h-11 rounded-xl border px-3.5 text-sm ${
        selected ? "border-accent bg-accent-soft text-text" : "border-line-2 text-text-2 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export function CaptureSheet({
  initialText,
  today,
  now,
  categories,
  activities,
  onClose,
  onSave,
  onDetails,
}: {
  initialText: string;
  today: LocalDate;
  /** Ora locale "HH:mm". */
  now: string;
  categories: LogCategory[];
  /** Discipline che fanno riconoscere un allenamento. */
  activities: string[];
  onClose: () => void;
  onSave: (draft: CaptureDraft, text: string) => void;
  /** Apre il modulo completo con ciò che è stato letto (solo attività ed eventi). */
  onDetails: (draft: CaptureDraft) => void;
}) {
  const [text, setText] = useState(initialText);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [byDeadline, setByDeadline] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const { spans: _spans, confidence, ...parsed } = parseCapture(text, { today, now, categories, activities, kind: overrides.kind });
  void _spans;
  const draft: CaptureDraft = { ...parsed, ...overrides };
  if ("categoryId" in overrides) {
    draft.sensitive = categories.find((c) => c.id === overrides.categoryId)?.is_sensitive ?? false;
  }

  const { kind } = draft;
  const birthday = isBirthday(draft);
  const kindLabel = birthday ? "Compleanno" : KIND_LABEL[kind];
  // Un compleanno senza giorno finirebbe su oggi: il giorno va scelto.
  const missingDay = birthday && !draft.date;
  const when = missingDay ? "scegli il giorno" : whenLabel(draft, today);
  const dated = kind === "task" || kind === "event" || kind === "workout" || kind === "log";
  const planned = kind === "task" || kind === "event";
  const timed = planned || kind === "workout";
  const hasText = text.trim().length > 0;
  const category = categories.find((c) => c.id === draft.categoryId);
  const deadlineMode = kind === "task" && (byDeadline ?? (!draft.date && !!draft.windowEnd));

  function set(patch: Overrides, close = true) {
    setOverrides((prev) => ({ ...prev, ...patch }));
    if (close) setPanel(null);
  }

  function toggle(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  function pickDay(date: LocalDate | null) {
    if (deadlineMode) set({ date: null, windowEnd: date });
    else set({ date, windowEnd: null });
  }

  function submit() {
    if (!draft.title.trim() || missingDay) {
      setError(true);
      input.current?.focus();
      return;
    }
    onSave(draft, text);
  }

  const selectedDay = deadlineMode ? draft.windowEnd : draft.date;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      // L'altezza segue lo spazio visibile: con la tastiera aperta il foglio le resta sopra.
      className="fixed inset-x-0 top-0 z-40 flex h-(--visual-viewport-height) items-end justify-center bg-scrim md:items-start md:px-6 md:pt-[14vh]"
    >
      <Modal className="max-h-full w-full overflow-y-auto rounded-t-[22px] border border-line bg-surface md:max-w-xl md:rounded-[22px]">
        <Dialog className="flex flex-col gap-3 px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 outline-none">
          <div className="flex items-center justify-between gap-3">
            <Heading slot="title" className="label-mono">
              Aggiungi
            </Heading>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="-mr-2.5 flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="capture-text" className="sr-only">
              Cosa vuoi aggiungere?
            </label>
            <input
              id="capture-text"
              ref={input}
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(false);
              }}
              placeholder="Scrivi come parli…"
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="done"
              aria-invalid={error}
              aria-describedby="capture-reading"
              className={`${inputClass} min-h-12 text-[17px]`}
            />

            {hasText ? (
              <>
                <p id="capture-reading" className="text-[15px] leading-snug text-text-2">
                  {draft.title ? (
                    draft.title
                  ) : birthday ? (
                    <span className={error ? "text-gold" : "text-text-3"} role={error ? "alert" : undefined}>
                      Di chi è il compleanno? Scrivi il nome.
                    </span>
                  ) : (
                    <span className={error ? "text-gold" : "text-text-3"} role={error ? "alert" : undefined}>
                      Manca il titolo: scrivi cosa aggiungere.
                    </span>
                  )}
                </p>

                <div role="group" aria-label="Interpretazione, tocca per correggere" className="flex flex-wrap gap-1.5">
                  <Chip
                    caption="Tipo"
                    onPress={() => toggle("kind")}
                    expanded={panel === "kind"}
                    tone={confidence === "low" && !overrides.kind ? "unsure" : "set"}
                    label={`Tipo: ${kindLabel}${confidence === "low" && !overrides.kind ? ", da confermare" : ""}`}
                  >
                    {kindLabel}
                  </Chip>

                  {dated ? (
                    <Chip
                      caption="Quando"
                      onPress={() => toggle("when")}
                      expanded={panel === "when"}
                      tone={missingDay ? "unsure" : draft.date || draft.windowEnd || kind !== "task" ? "set" : "empty"}
                      label={`Quando: ${when}`}
                    >
                      {when}
                    </Chip>
                  ) : null}

                  {dated && !birthday ? (
                    <Chip
                      caption="Ora"
                      onPress={() => toggle("time")}
                      expanded={panel === "time"}
                      tone={draft.time ? "set" : "empty"}
                      label={draft.time ? `Ora: ${draft.time}` : "Aggiungi un orario"}
                    >
                      {draft.time ?? (kind === "event" ? "tutto il giorno" : "nessuna")}
                    </Chip>
                  ) : null}

                  {timed && !birthday ? (
                    <Chip
                      caption="Durata"
                      onPress={() => toggle("duration")}
                      expanded={panel === "duration"}
                      tone={draft.durationMin ? "set" : "empty"}
                      label={draft.durationMin ? `Durata: ${formatDuration(draft.durationMin)}` : "Aggiungi una durata"}
                    >
                      {draft.durationMin ? formatDuration(draft.durationMin) : "nessuna"}
                    </Chip>
                  ) : null}

                  {planned && draft.repeat ? (
                    <Chip onPress={() => set({ repeat: null })} label={`${describeRule(draft.repeat)}. Tocca per togliere la ripetizione`}>
                      {describeRule(draft.repeat).toLowerCase()}
                      <Icon name="close" size={13} />
                    </Chip>
                  ) : null}

                  {planned ? (
                    <Chip
                      onPress={() => set({ attention: NEXT_ATTENTION[draft.attention] }, false)}
                      tone={draft.attention === "high" ? "gold" : draft.attention === "medium" ? "set" : "empty"}
                      label={`Attenzione ${ATTENTION_LABEL[draft.attention]}. Tocca per cambiare`}
                    >
                      {draft.attention === "low" ? "+ attenzione" : `attenzione ${ATTENTION_LABEL[draft.attention]}`}
                    </Chip>
                  ) : null}

                  {kind === "log" ? (
                    <Chip
                      caption="Categoria"
                      onPress={() => toggle("category")}
                      expanded={panel === "category"}
                      tone={category ? "set" : "empty"}
                      label={category ? `Categoria: ${category.name}` : "Scegli una categoria"}
                    >
                      {category?.name ?? "nessuna"}
                    </Chip>
                  ) : null}

                  <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-line-2 px-3.5 text-[13px] text-text-2">
                    <span className={captionClass}>In</span>
                    {missingDay ? "Agenda" : destinationLabel(draft, today)}
                  </span>
                </div>

                {panel === "kind" ? (
                  <div role="group" aria-label="Tipo" className="flex flex-wrap gap-1.5">
                    {KINDS.map((k) => (
                      <Option key={k} selected={k === kind} onPress={() => set({ kind: k })}>
                        {KIND_LABEL[k]}
                      </Option>
                    ))}
                  </div>
                ) : null}

                {panel === "when" ? (
                  <div className="flex flex-col gap-2">
                    {kind === "task" ? (
                      <div role="group" aria-label="Giorno o scadenza" className="flex gap-1.5">
                        <Option selected={!deadlineMode} onPress={() => setByDeadline(false)}>
                          Il giorno
                        </Option>
                        <Option selected={deadlineMode} onPress={() => setByDeadline(true)}>
                          Entro il
                        </Option>
                      </div>
                    ) : null}
                    <div role="group" aria-label="Giorno" className="flex flex-wrap gap-1.5">
                      {quickDays(today, kind === "log").map((d) => (
                        <Option key={d.date} selected={selectedDay === d.date} onPress={() => pickDay(d.date)}>
                          {d.label}
                        </Option>
                      ))}
                      {kind === "task" ? (
                        <Option selected={!draft.date && !draft.windowEnd} onPress={() => set({ date: null, windowEnd: null })}>
                          Senza data
                        </Option>
                      ) : null}
                    </div>
                    <label className="flex items-center gap-3 text-xs text-text-2">
                      Altra data
                      <input
                        type="date"
                        value={selectedDay ?? ""}
                        onChange={(e) => {
                          if (e.target.value) pickDay(e.target.value);
                        }}
                        className={`${inputClass} w-auto flex-1`}
                      />
                    </label>
                  </div>
                ) : null}

                {panel === "time" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="capture-time" className="text-xs text-text-2">
                      Ora
                    </label>
                    <input
                      id="capture-time"
                      type="time"
                      value={draft.time ?? ""}
                      onChange={(e) => set({ time: e.target.value || null }, false)}
                      className={`${inputClass} w-auto min-w-24 flex-1`}
                    />
                    <Option selected={!draft.time} onPress={() => set({ time: null })}>
                      {kind === "event" ? "Tutto il giorno" : "Senza orario"}
                    </Option>
                  </div>
                ) : null}

                {panel === "duration" ? (
                  <div role="group" aria-label="Durata" className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((d) => (
                      <Option key={d} selected={draft.durationMin === d} onPress={() => set({ durationMin: d })}>
                        {formatDuration(d)}
                      </Option>
                    ))}
                    <Option selected={!draft.durationMin} onPress={() => set({ durationMin: null })}>
                      Nessuna
                    </Option>
                  </div>
                ) : null}

                {panel === "category" ? (
                  <div role="group" aria-label="Categoria" className="flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <Option key={c.id} selected={c.id === draft.categoryId} onPress={() => set({ categoryId: c.id })}>
                        {c.name}
                      </Option>
                    ))}
                    <Option selected={!draft.categoryId} onPress={() => set({ categoryId: null })}>
                      Nessuna
                    </Option>
                  </div>
                ) : null}

                {birthday ? (
                  <p className={`text-xs ${error && missingDay ? "text-gold" : "text-text-3"}`} role={error && missingDay ? "alert" : undefined}>
                    {missingDay ? "Scrivi anche il giorno, per esempio “compleanno Marta 12 ottobre”." : "Tutto il giorno, ogni anno."}
                  </p>
                ) : null}
                {kind === "task" && !draft.date && !draft.windowEnd && !draft.time && !draft.repeat ? (
                  <p className="text-xs text-text-3">Senza data non compare in Oggi: la ritroverai nella ricerca.</p>
                ) : null}
                {kind === "task" && !draft.date && draft.windowEnd ? (
                  <p className="text-xs text-text-3">Resta discreta in “Nel periodo” e sale in “Da fare oggi” l’ultimo giorno.</p>
                ) : null}
                {kind === "log" && draft.sensitive ? (
                  <p className="text-xs text-text-3">Categoria riservata: nel calendario e nelle notifiche comparirà un titolo neutro.</p>
                ) : null}
                {kind === "wishlist" && draft.url ? (
                  <p className="break-all text-xs text-text-3">Link: {draft.url}</p>
                ) : null}
              </>
            ) : (
              <div id="capture-reading" className="flex flex-col gap-1 text-[13px] text-text-3">
                <p>Per esempio:</p>
                <ul className="flex flex-col">
                  {EXAMPLES.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onMouseDown={keepFocus}
                        onClick={() => setText(example)}
                        className="-ml-2 min-h-11 rounded-lg px-2 text-left text-text-2 hover:bg-surface-2 hover:text-text"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
                <div role="group" aria-label="Prefissi" className="flex flex-wrap items-center gap-1.5">
                  <span>Oppure inizia con</span>
                  {PREFIXES.map((prefix) => (
                    <button
                      key={prefix}
                      type="button"
                      onMouseDown={keepFocus}
                      onClick={() => setText(`${prefix} `)}
                      className="min-h-11 rounded-lg border border-line-2 px-2.5 font-mono text-xs text-text-2 hover:text-text"
                    >
                      {prefix}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {planned && hasText ? (
                <Button variant="quiet" onClick={() => onDetails(draft)}>
                  Altri dettagli
                </Button>
              ) : null}
              <Button type="submit" variant="primary" disabled={!hasText} className="min-w-28">
                Aggiungi
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
