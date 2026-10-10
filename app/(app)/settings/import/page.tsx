"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Button, Segmented } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { importItems, type ImportResult } from "@/lib/data/api";
import { useInvalidateDay, useTimezone, useToday } from "@/lib/data/hooks";
import { shortDate, type LocalDate } from "@/lib/dates/local";
import { isUpcoming, itemMoment, parseIcs, type ImportItem, type SkippedItem } from "@/lib/import/ics";
import { describeRRule } from "@/lib/recurrence/rule";

type Scope = "upcoming" | "all";
type Parsed = { files: string[]; items: ImportItem[]; skipped: SkippedItem[] };

const keyOf = (item: ImportItem) => `${item.kind}:${item.uid}`;

function dayLabel(date: LocalDate, today: LocalDate): string {
  return date.slice(0, 4) === today.slice(0, 4) ? shortDate(date) : `${shortDate(date)} ${date.slice(0, 4)}`;
}

function describe(item: ImportItem, tz: string, today: LocalDate): string {
  const { date, time } = itemMoment(item, tz);
  if (!date) return "Senza data";
  const parts = [item.rrule ? `${describeRRule(item.rrule)}, dal ${dayLabel(date, today)}` : dayLabel(date, today)];
  if (item.endDate) parts[0] += ` – ${dayLabel(item.endDate, today)}`;
  if (time) parts.push(time);
  if (item.location) parts.push(item.location);
  return parts.join(" · ");
}

export default function ImportPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const invalidate = useInvalidateDay();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [asTask, setAsTask] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setResult(null);
    const next: Parsed = { files: [], items: [], skipped: [] };
    const seen = new Set<string>();
    const rejected: string[] = [];
    for (const file of files) {
      const text = await file.text().catch(() => "");
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        rejected.push(file.name);
        continue;
      }
      const calendar = parseIcs(text, tz);
      next.files.push(file.name);
      next.skipped.push(...calendar.skipped);
      for (const item of calendar.items) {
        if (seen.has(keyOf(item))) continue;
        seen.add(keyOf(item));
        next.items.push(item);
      }
    }
    if (rejected.length) {
      const zip = rejected.some((name) => /\.zip$/i.test(name));
      setError(
        zip
          ? "È un archivio .zip: aprilo e scegli i file .ics che contiene."
          : `Non è un calendario .ics: ${rejected.join(", ")}.`,
      );
    }
    if (!next.files.length) return;
    next.items.sort((a, b) => (a.startAt ?? a.startDate ?? "").localeCompare(b.startAt ?? b.startDate ?? ""));
    setParsed(next);
    setExcluded(new Set());
    setAsTask(new Set());
  }

  function toggle(set: Set<string>, update: (next: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    update(next);
  }

  const visible = parsed ? (scope === "all" ? parsed.items : parsed.items.filter((i) => isUpcoming(i, today))) : [];
  const hiddenPast = parsed ? parsed.items.length - visible.length : 0;
  const selected = visible.filter((i) => !excluded.has(keyOf(i)));
  const allSelected = selected.length === visible.length;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const items = selected.map((i) => (asTask.has(keyOf(i)) ? { ...i, kind: "task" as const } : i));
      setResult(await importItems(items, tz));
      setParsed(null);
      invalidate();
    } catch {
      setError("Import non riuscito. Controlla la connessione e riprova: ciò che è già stato salvato non verrà duplicato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <Link href="/settings" className="-ml-2 flex min-h-11 items-center self-start rounded-xl px-2 text-sm text-text-2 hover:text-text">
        ← Impostazioni
      </Link>
      <PageHeader eyebrow="Dati" title="Importa" muted="da calendario" />

      {result ? (
        <div role="status" className="flex flex-col gap-3 rounded-[14px] bg-accent-soft p-4 text-sm leading-relaxed">
          <p>
            {result.created === 1 ? "1 elemento importato." : `${result.created} elementi importati.`}
            {result.existing > 0
              ? ` ${result.existing === 1 ? "1 era già presente" : `${result.existing} erano già presenti`} e non ${result.existing === 1 ? "è stato duplicato" : "sono stati duplicati"}.`
              : ""}
          </p>
          <Link href="/today" className="flex min-h-11 items-center self-start rounded-xl border border-line-2 px-4 text-sm hover:bg-surface-2">
            Vai a Oggi
          </Link>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-gold">
          {error}
        </p>
      ) : null}

      {!parsed ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ics-file" className="text-xs text-text-2">
              File del calendario (.ics), anche più di uno
            </label>
            <input
              id="ics-file"
              type="file"
              accept=".ics,text/calendar"
              multiple
              onChange={onFiles}
              className="min-h-11 w-full rounded-xl border border-line-2 bg-bg text-sm text-text-2 file:mr-3 file:min-h-11 file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:text-text"
            />
          </div>
          <p className="text-sm leading-relaxed text-text-2">
            Prima di salvare vedi l’elenco e scegli cosa tenere. Gli eventi importati diventano tuoi: li modifichi qui, e il
            calendario di origine resta com’è.
          </p>
          <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm leading-relaxed text-text-2">
            <h2 className="label-mono">Dove trovo il file</h2>
            <p>
              <span className="text-text">Google Calendar</span> (dal computer): Impostazioni → Importazione ed esportazione →
              Esporta. Scarichi un archivio .zip con un file .ics per ogni calendario: aprilo e scegli solo quelli personali.
            </p>
            <p>
              <span className="text-text">Calendario Apple</span> (dal Mac): seleziona un calendario, poi File → Esporta →
              Esporta.
            </p>
            <p>
              <span className="text-text">Outlook</span>: File → Salva calendario, oppure dal web Impostazioni → Calendari
              condivisi → Pubblica e scarica il file ICS.
            </p>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            {parsed.files.join(", ")} · {parsed.items.length === 1 ? "1 elemento riconosciuto" : `${parsed.items.length} elementi riconosciuti`}
          </p>
          <Segmented<Scope>
            label="Periodo"
            value={scope}
            onChange={setScope}
            options={[
              { value: "upcoming", label: "Da oggi in poi" },
              { value: "all", label: "Tutto, anche il passato" },
            ]}
          />
          {scope === "upcoming" && hiddenPast > 0 ? (
            <p className="text-xs text-text-3">
              {hiddenPast === 1 ? "1 elemento già passato resta fuori." : `${hiddenPast} elementi già passati restano fuori.`}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              title="Niente da importare in questo periodo"
              hint={hiddenPast > 0 ? "Scegli “Tutto” per vedere anche gli elementi passati." : "Il file non contiene eventi o promemoria."}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="label-mono">
                  {selected.length} di {visible.length} selezionati
                </span>
                <Button
                  variant="quiet"
                  onClick={() => setExcluded(allSelected ? new Set(visible.map(keyOf)) : new Set())}
                >
                  {allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
                </Button>
              </div>
              <ul className="flex flex-col">
                {visible.map((item) => {
                  const key = keyOf(item);
                  const on = !excluded.has(key);
                  const task = item.kind === "task" || asTask.has(key);
                  const canSwitch = item.kind === "event" && !item.rrule;
                  return (
                    <li key={key} className="flex items-center gap-1 border-b border-line last:border-b-0">
                      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1 py-1.5">
                        <span className="-ml-2.5 flex size-11 shrink-0 items-center justify-center">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={on}
                            onChange={() => toggle(excluded, setExcluded, key)}
                          />
                          <span
                            className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                              on ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
                            }`}
                          >
                            <Icon name="check" size={14} />
                          </span>
                        </span>
                        <span className={`flex min-w-0 flex-col gap-0.5 ${on ? "" : "opacity-50"}`}>
                          <span className="break-words text-[15px] leading-snug">{item.title}</span>
                          <span className="text-xs text-text-3">{describe(item, tz, today)}</span>
                          {item.warnings.map((w) => (
                            <span key={w} className="text-xs text-text-2">
                              {w}
                            </span>
                          ))}
                        </span>
                      </label>
                      {canSwitch ? (
                        <button
                          type="button"
                          aria-pressed={task}
                          aria-label={`Importa come attività da spuntare: ${item.title}`}
                          onClick={() => toggle(asTask, setAsTask, key)}
                          className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs transition-colors ${
                            task ? "border-accent text-accent" : "border-line-2 text-text-2 hover:text-text"
                          }`}
                        >
                          {task ? "Attività" : "Evento"}
                        </button>
                      ) : (
                        <span className="shrink-0 px-3 text-xs text-text-3">{task ? "Attività" : "Evento"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs leading-relaxed text-text-3">
                Tocca “Evento” per trasformare una voce in un’attività da spuntare. Le serie che si ripetono restano eventi.
              </p>
            </>
          )}

          {parsed.skipped.length ? (
            <details className="rounded-[14px] border border-line px-4 py-1 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-text-2">
                {parsed.skipped.length === 1 ? "1 voce non importata" : `${parsed.skipped.length} voci non importate`}
              </summary>
              <ul className="flex flex-col gap-2 pb-3">
                {parsed.skipped.map((s, i) => (
                  <li key={i} className="flex flex-col">
                    <span className="break-words">{s.title}</span>
                    <span className="text-xs text-text-3">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="sticky bottom-[calc(88px+env(safe-area-inset-bottom))] flex flex-wrap gap-2 bg-bg py-3 md:bottom-0">
            <Button variant="primary" onClick={save} disabled={busy || selected.length === 0}>
              {busy ? "Importo…" : selected.length === 1 ? "Importa 1 elemento" : `Importa ${selected.length} elementi`}
            </Button>
            <Button onClick={() => setParsed(null)} disabled={busy}>
              Scegli un altro file
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
