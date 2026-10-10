"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useCapture } from "@/components/capture/capture-provider";
import { ItemEditor } from "@/components/today/item-editor";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { useTaskActions, useTimezone, useToday } from "@/lib/data/hooks";
import { useLogUnlocked } from "@/lib/data/log-hooks";
import { fetchTaskById, searchAll } from "@/lib/data/search";
import type { LocalDate } from "@/lib/dates/local";
import { openDayNext } from "@/lib/nav/day-handoff";
import {
  KIND_LABEL,
  groupResults,
  isSearchable,
  matchCommands,
  parseSearchQuery,
  resultMeta,
  resultTarget,
  type Command,
  type SearchResult,
} from "@/lib/search/query";
import { getSupabase } from "@/lib/supabase/client";
import type { Task } from "@/lib/supabase/types";
import { applyTheme, readTheme } from "@/lib/theme";

const SearchContext = createContext<() => void>(() => {});

/** Apre la ricerca globale (command palette) da qualsiasi punto dell'app. */
export function useSearch() {
  return useContext(SearchContext);
}

const DEBOUNCE_MS = 250;

export function SearchProvider({ children }: { children: ReactNode }) {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const actions = useTaskActions(today, tz);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const show = useCallback(() => setOpen(true), []);

  // ⌘K / Ctrl+K da qualsiasi schermata, anche mentre si scrive; non sopra un altro foglio aperto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "k") return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchContext.Provider value={show}>
      {children}
      {open ? <Palette today={today} onClose={() => setOpen(false)} onEditTask={setEditing} /> : null}
      {editing ? (
        <ItemEditor target={{ kind: "task", task: editing }} today={today} tz={tz} onClose={() => setEditing(null)} onDeleteTask={actions.remove} />
      ) : null}
    </SearchContext.Provider>
  );
}

type Row = { id: string; run: () => void; title: string; meta?: string; icon?: "plus" | "search"; muted?: boolean };
type Section = { label: string; rows: Row[] };
type Found = { for: string; results: SearchResult[] } | { for: string; error: "offline" | "failed" };

function Palette({ today, onClose, onEditTask }: { today: LocalDate; onClose: () => void; onEditTask: (task: Task) => void }) {
  const router = useRouter();
  const capture = useCapture();
  const toast = useToast();
  const unlocked = useLogUnlocked();
  const listId = useId();
  const [text, setText] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [active, setActive] = useState(0);

  const query = useMemo(() => parseSearchQuery(text, today), [text, today]);
  const searchable = isSearchable(query);
  // La risposta vale solo per il testo (e lo stato del blocco) con cui è stata chiesta.
  const key = `${unlocked}|${query.text}|${query.from}|${query.to}`;

  useEffect(() => {
    if (!searchable) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchAll(query, unlocked)
        .then((results) => {
          if (!stale) setFound({ for: key, results });
        })
        .catch(() => {
          if (!stale) setFound({ for: key, error: navigator.onLine ? "failed" : "offline" });
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `query` e `key` cambiano insieme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, searchable]);

  const current = searchable && found?.for === key ? found : null;
  const results = current && "results" in current ? current.results : null;
  const error = current && "error" in current ? current.error : null;
  const loading = searchable && !current;

  function go(href: string, day?: LocalDate) {
    onClose();
    if (day) openDayNext(day);
    router.push(href);
  }

  function runCommand(c: Command) {
    if (c.href) return go(c.href);
    if (c.id === "theme") {
      const next = readTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      getSupabase().from("profiles").update({ theme: next }).neq("theme", next).then(() => {});
      onClose();
    }
  }

  async function openResult(r: SearchResult) {
    const target = resultTarget(r);
    if (r.kind !== "task") return go(target.href, target.day);
    // Le attività si aprono nel modulo di modifica: così si raggiungono anche quelle senza data.
    onClose();
    try {
      const task = await fetchTaskById(r.id);
      if (task) return onEditTask(task);
      toast({ message: "Questa attività non c'è più.", tone: "warn" });
    } catch {
      if (target.day) openDayNext(target.day);
      router.push(target.href);
    }
  }

  const trimmed = text.trim();
  const sections: Section[] = [];
  const commands = matchCommands(trimmed);
  const add: Row = {
    id: "add",
    title: trimmed ? `Aggiungi «${trimmed}»` : "Aggiungi…",
    icon: "plus",
    run: () => {
      onClose();
      capture(trimmed);
    },
  };
  // Senza testo: i comandi. Con il testo: prima ciò che si è trovato, poi le azioni.
  const actionRows = [add, ...commands.map((c) => ({ id: `cmd-${c.id}`, title: c.label, run: () => runCommand(c) }))];
  if (results) {
    for (const group of groupResults(results)) {
      sections.push({
        label: KIND_LABEL[group.kind],
        rows: group.items.map((r) => ({
          id: `${r.kind}-${r.id}`,
          title: r.title,
          meta: resultMeta(r, today),
          muted: r.done,
          run: () => void openResult(r),
        })),
      });
    }
  }
  sections.push({ label: trimmed ? "Azioni" : "Comandi", rows: actionRows });

  const rows = sections.flatMap((s) => s.rows);
  const activeIndex = Math.min(active, rows.length - 1);
  const activeId = rows[activeIndex] ? `${listId}-${rows[activeIndex].id}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      rows[activeIndex]?.run();
    }
  }

  const status = loading
    ? "Cerco…"
    : error === "offline"
      ? "Per cercare serve la connessione."
      : error
        ? "La ricerca non è riuscita. Riprova."
        : results && results.length === 0
          ? "Nessun risultato."
          : results
            ? `${results.length} ${results.length === 1 ? "risultato" : "risultati"}`
            : "";

  return (
    <ModalOverlay
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-40 flex items-start justify-center bg-scrim md:p-6 md:pt-[12vh]"
    >
      <Modal className="flex max-h-dvh w-full flex-col border-b border-line bg-surface pt-[env(safe-area-inset-top)] md:max-h-[70vh] md:max-w-xl md:rounded-[18px] md:border md:pt-0">
        <Dialog aria-label="Cerca" className="flex min-h-0 flex-col outline-none">
          <Heading slot="title" className="sr-only">
            Cerca
          </Heading>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Icon name="search" size={18} className="shrink-0 text-text-3" />
            <label htmlFor={`${listId}-input`} className="sr-only">
              Cerca o scrivi un comando
            </label>
            <input
              id={`${listId}-input`}
              autoFocus
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Cerca o scrivi un comando"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-3"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {query.period || status ? (
            <p role="status" aria-live="polite" className="flex flex-wrap gap-x-3 px-4 pt-3 text-xs text-text-3">
              {query.period ? <span className="text-text-2">Periodo: {query.period}</span> : null}
              <span>{status}</span>
            </p>
          ) : null}

          <div id={listId} role="listbox" aria-label="Risultati e comandi" className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2">
            {sections.map((section) => (
              <div key={section.label} role="group" aria-label={section.label} className="pb-1">
                <div aria-hidden className="label-mono px-2.5 pb-1 pt-2">
                  {section.label}
                </div>
                {section.rows.map((row) => {
                  const isActive = rows[activeIndex] === row;
                  return (
                    <div
                      key={row.id}
                      id={`${listId}-${row.id}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={row.run}
                      onPointerMove={() => {
                        if (!isActive) setActive(rows.indexOf(row));
                      }}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-sm ${isActive ? "bg-surface-2" : ""}`}
                    >
                      {row.icon ? <Icon name={row.icon} size={15} className="shrink-0 text-text-3" /> : null}
                      <span className={`min-w-0 flex-1 truncate ${row.muted ? "text-text-3" : "text-text"}`}>{row.title}</span>
                      {row.meta ? <span className="max-w-[55%] shrink-0 truncate text-xs text-text-3">{row.meta}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {searchable && !unlocked ? (
              <p className="px-2.5 pb-2 pt-3 text-xs leading-relaxed text-text-3">Le registrazioni riservate compaiono solo a Log sbloccato.</p>
            ) : null}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
