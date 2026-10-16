"use client";

import { useState } from "react";
import { CategorySheet } from "@/components/log/category-sheet";
import { EntrySheet } from "@/components/log/entry-sheet";
import { LockSheet } from "@/components/log/lock-sheet";
import { Button, Segmented, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useLogCategories, useOffline, useTimezone, useToday } from "@/lib/data/hooks";
import { createCategory, createEntry, deleteCategory, setEntryDeleted, updateCategory, updateEntry, type LogEntryInput } from "@/lib/data/log";
import { useKeepUnlockedWhileActive, useLogUnlocked, useOpenEntries, usePrivateEntries, usePrivateStubs } from "@/lib/data/log-hooks";
import { shortDate, trimTime, weekdayName } from "@/lib/dates/local";
import {
  NEUTRAL_TITLE,
  NO_FILTER,
  daysAgoLabel,
  groupByMonth,
  isFiltering,
  lastSeenByCategory,
  monthLabel,
  tagsOf,
  timelineRows,
  type LogFilter,
  type Period,
} from "@/lib/log/timeline";
import type { LogCategory, LogEntry } from "@/lib/supabase/types";

type View = "timeline" | "categories";

const VIEWS: { value: View; label: string }[] = [
  { value: "timeline", label: "Cronologia" },
  { value: "categories", label: "Categorie" },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "Tutto" },
  { value: "30d", label: "30 giorni" },
  { value: "year", label: "Quest'anno" },
];

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] transition-colors ${
    active ? "border-line-2 bg-surface-2 text-text" : "border-line text-text-2 hover:text-text"
  }`;

/** Punto da 6 px con il colore della categoria. */
function Dot({ color }: { color: string }) {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export default function LogPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const toast = useToast();
  const offline = useOffline();
  const unlocked = useLogUnlocked();
  useKeepUnlockedWhileActive();

  const categories = useLogCategories().data ?? [];
  const openQuery = useOpenEntries();
  const stubs = usePrivateStubs().data ?? [];
  const privateQuery = usePrivateEntries();

  const [view, setView] = useState<View>("timeline");
  const [filter, setFilter] = useState<LogFilter>(NO_FILTER);
  const [locking, setLocking] = useState(false);
  const [editing, setEditing] = useState<LogEntry | "new" | null>(null);
  const [editingCategory, setEditingCategory] = useState<LogCategory | "new" | null>(null);

  const readable = [...(openQuery.data ?? []), ...(unlocked ? (privateQuery.data ?? []) : [])];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const rows = timelineRows(readable, stubs, filter, today);
  const groups = groupByMonth(rows);
  const tags = tagsOf(readable);
  const hiddenCount = unlocked ? 0 : stubs.length;
  const lastSeen = lastSeenByCategory(categories, readable, today, unlocked).filter((c) => c.category.track_last);
  const missing = openQuery.data === undefined;
  const failed = missing && (offline || openQuery.isError);

  async function attempt(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch {
      return false;
    }
  }

  async function save(input: LogEntryInput): Promise<boolean> {
    const target = editing;
    const ok = await attempt(() => (target && target !== "new" ? updateEntry(target, input) : createEntry(input)));
    if (ok) {
      setEditing(null);
      toast({ message: "Registrazione salvata" });
    }
    return ok;
  }

  async function remove(entry: LogEntry) {
    setEditing(null);
    if (!(await attempt(() => setEntryDeleted(entry, true)))) {
      toast({ message: "Non eliminata: serve la connessione.", tone: "warn" });
      return;
    }
    toast({
      message: "Registrazione eliminata",
      actionLabel: "Annulla",
      onAction: () => {
        void attempt(() => setEntryDeleted(entry, false)).then((ok) => {
          if (!ok) toast({ message: "Non è stato possibile annullare.", tone: "warn" });
        });
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5 md:px-10 md:py-7">
      <PageHeader
        eyebrow="Personal Log"
        title={view === "timeline" ? "Cronologia" : "Categorie"}
        actions={
          <button
            type="button"
            onClick={() => setLocking(true)}
            data-tour="log-lock"
            aria-label={unlocked ? "Log sbloccato: gestisci il blocco" : "Sblocca il Log"}
            className={`-mr-2.5 flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-[13px] hover:bg-surface-2 ${unlocked ? "text-accent" : "text-text-2"}`}
          >
            <Icon name="lock" size={18} />
            {unlocked ? "Sbloccato" : "Bloccato"}
          </button>
        }
      />

      <Segmented label="Vista del Log" value={view} options={VIEWS} onChange={setView} tour="log-views" />

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-[14px] border border-line-2 px-4 py-3 text-sm">
          <p>{offline ? "Il Log non è ancora stato scaricato su questo dispositivo: serve la connessione." : "Non riesco a caricare il Log. Controlla la connessione."}</p>
          <button type="button" onClick={() => openQuery.refetch()} className="-ml-2.5 min-h-11 rounded-lg px-2.5 text-accent hover:bg-surface-2">
            Riprova
          </button>
        </div>
      ) : missing ? (
        <p className="text-sm text-text-3" aria-live="polite">
          Carico il Log…
        </p>
      ) : view === "timeline" ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <label htmlFor="log-search" className="sr-only">
                Cerca nel Log
              </label>
              <input
                id="log-search"
                type="search"
                value={filter.query}
                onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                placeholder="Cerca nel Log"
                autoComplete="off"
                className={inputClass}
              />
              <Button variant="primary" onClick={() => setEditing("new")} className="shrink-0">
                Aggiungi
              </Button>
            </div>
            <div role="group" aria-label="Categoria" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
              <button type="button" aria-pressed={!filter.categoryId} onClick={() => setFilter({ ...filter, categoryId: null })} className={chip(!filter.categoryId)}>
                Tutte
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={filter.categoryId === c.id}
                  onClick={() => setFilter({ ...filter, categoryId: filter.categoryId === c.id ? null : c.id })}
                  className={chip(filter.categoryId === c.id)}
                >
                  <Dot color={c.color} />
                  {c.name}
                </button>
              ))}
            </div>
            {tags.length > 0 ? (
              <div role="group" aria-label="Tag" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
                {tags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={filter.tag === tag}
                    onClick={() => setFilter({ ...filter, tag: filter.tag === tag ? null : tag })}
                    className={chip(filter.tag === tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : null}
            <Segmented label="Periodo" value={filter.period} options={PERIODS} onChange={(period) => setFilter({ ...filter, period })} />
          </div>

          {/* "Ultima volta" in testa alla cronologia, finché non si cerca o filtra. */}
          {!isFiltering(filter) && lastSeen.length > 0 ? (
            <section data-tour="log-last" className="flex flex-col gap-2">
              <h2 className="label-mono">Ultima volta</h2>
              <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {lastSeen.map(({ category, last, hidden }) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => setFilter({ ...NO_FILTER, categoryId: category.id })}
                      aria-label={`${category.name}: ${hidden ? "riservata" : last ? daysAgoLabel(last, today) : "mai registrata"}. Apri le registrazioni`}
                      className="flex min-h-[64px] w-full flex-col justify-center gap-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-1.5 text-[13px] text-text-2">
                        {category.is_sensitive ? <Icon name="lock" size={12} className="shrink-0" /> : null}
                        <span className="min-w-0 truncate">{category.name}</span>
                      </span>
                      <span className={`text-[17px] first-letter:uppercase ${hidden || !last ? "text-text-3" : "text-text"}`}>
                        {hidden ? "Riservata" : last ? daysAgoLabel(last, today) : "Mai"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setLocking(true)}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-3.5 text-left text-sm text-text-2 hover:text-text"
            >
              <span>
                {hiddenCount === 1 ? "1 registrazione riservata" : `${hiddenCount} registrazioni riservate`}
                {isFiltering(filter) ? " non comprese nella ricerca" : ""}
              </span>
              <span className="shrink-0 text-accent">Sblocca</span>
            </button>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState
              title={isFiltering(filter) || filter.period !== "all" ? "Nessuna registrazione con questi filtri." : "Il Log è vuoto."}
              hint="Qui segni ciò che è già successo: unghie, parrucchiere, trattamenti. Anche dal + con “log: …”."
            />
          ) : (
            groups.map((group) => (
              <section key={group.month} className="flex flex-col gap-1">
                <h2 className="label-mono">{monthLabel(group.month)}</h2>
                <ul className="flex flex-col">
                  {group.rows.map((row) =>
                    row.kind === "stub" ? (
                      <li key={row.stub.id} className="border-b border-line last:border-b-0">
                        <button type="button" onClick={() => setLocking(true)} className="flex min-h-11 w-full items-center gap-3 py-2 text-left">
                          <DateCell date={row.stub.date} />
                          <span className="flex items-center gap-2 text-[15px] text-text-3">
                            <Icon name="lock" size={14} />
                            {NEUTRAL_TITLE}
                          </span>
                        </button>
                      </li>
                    ) : (
                      <EntryRow key={row.entry.id} entry={row.entry} category={categoryById.get(row.entry.category_id ?? "")} onOpen={() => setEditing(row.entry)} />
                    ),
                  )}
                </ul>
              </section>
            ))
          )}
        </>
      ) : (
        <>
          <ul className="flex flex-col">
            {lastSeenByCategory(categories, readable, today, unlocked).map(({ category, last, count, hidden }) => (
              <li key={category.id} className="flex items-center gap-1 border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setFilter({ ...NO_FILTER, categoryId: category.id });
                    setView("timeline");
                  }}
                  aria-label={`Apri le registrazioni di ${category.name}`}
                  className="flex min-h-[52px] min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-[15px]">
                    <Dot color={category.color} />
                    <span className="min-w-0 break-words">{category.name}</span>
                    {category.is_sensitive ? <Icon name="lock" size={13} className="shrink-0 text-text-3" /> : null}
                  </span>
                  <span className="shrink-0 text-right text-xs text-text-3">
                    {hidden
                      ? "riservata"
                      : !category.track_last
                        ? count === 1
                          ? "1 registrazione"
                          : `${count} registrazioni`
                        : last
                          ? `ultima volta: ${daysAgoLabel(last, today)}`
                          : "mai registrata"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategory(category)}
                  aria-label={`Modifica la categoria ${category.name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text"
                >
                  <Icon name="more" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setEditingCategory("new")}
            className="-ml-2.5 flex min-h-11 items-center gap-2 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <Icon name="plus" size={16} />
            Nuova categoria
          </button>
        </>
      )}

      {locking ? <LockSheet onClose={() => setLocking(false)} /> : null}

      {editing ? (
        <EntrySheet
          key={editing === "new" ? "new" : editing.id}
          entry={editing === "new" ? null : editing}
          categories={categories}
          today={today}
          defaultCategoryId={filter.categoryId}
          onSave={save}
          onDelete={() => {
            if (editing !== "new") void remove(editing);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editingCategory ? (
        <CategorySheet
          key={editingCategory === "new" ? "new" : editingCategory.id}
          category={editingCategory === "new" ? null : editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={async (input) => {
            const target = editingCategory;
            const ok = await attempt(() => (target === "new" ? createCategory(input, categories.length + 1) : updateCategory(target.id, input)));
            if (ok) setEditingCategory(null);
            return ok;
          }}
          onDelete={async () => {
            if (editingCategory === "new") return true;
            const ok = await attempt(() => deleteCategory(editingCategory.id));
            if (ok) {
              setEditingCategory(null);
              if (filter.categoryId === editingCategory.id) setFilter(NO_FILTER);
            }
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

function DateCell({ date }: { date: string }) {
  return (
    <span className="flex w-11 shrink-0 flex-col items-center leading-tight">
      <span className="text-[17px] text-text">{Number(date.slice(8))}</span>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">{weekdayName(date).slice(0, 3)}</span>
      <span className="sr-only">{shortDate(date)}</span>
    </span>
  );
}

function EntryRow({ entry, category, onOpen }: { entry: LogEntry; category: LogCategory | undefined; onOpen: () => void }) {
  const details = [category?.name, entry.time ? trimTime(entry.time) : null, ...entry.tags.map((t) => `#${t}`)].filter(Boolean);
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-start gap-3 py-2.5 text-left">
        <DateCell date={entry.date} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[15px] leading-snug">
            <span className="min-w-0 break-words">{entry.title}</span>
            {category ? <Dot color={category.color} /> : null}
            {entry.is_sensitive ? <Icon name="lock" size={13} className="shrink-0 text-text-3" /> : null}
          </span>
          {details.length ? <span className="text-xs text-text-3">{details.join(" · ")}</span> : null}
          {entry.notes ? <span className="line-clamp-2 text-sm text-text-2">{entry.notes}</span> : null}
        </span>
      </button>
    </li>
  );
}
