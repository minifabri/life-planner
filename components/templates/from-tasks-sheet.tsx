"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useRangeTasks } from "@/lib/data/hooks";
import { addDays, shortDate, type LocalDate } from "@/lib/dates/local";
import type { Task, TemplateItem } from "@/lib/supabase/types";
import { itemsFromTasks } from "@/lib/templates/apply";

/** Sceglie un gruppo di attività già in calendario da cui ricavare un template (Product Definition 7.9). */
export function FromTasksSheet({ today, tz, onPick, onClose }: { today: LocalDate; tz: string; onPick: (items: TemplateItem[]) => void; onClose: () => void }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const valid = !!from && !!to && from <= to;
  const query = useRangeTasks(valid ? from : today, valid ? to : today, tz);
  // Le attività nate da un pasto appartengono al planner dei pasti: non hanno senso in un template.
  const tasks: Task[] = valid
    ? (query.data ?? [])
        .filter((t) => t.date && t.date >= from && t.date <= to && t.status !== "dismissed" && t.source !== "meal")
        .sort((a, b) => a.date!.localeCompare(b.date!) || (a.time ?? "99").localeCompare(b.time ?? "99"))
    : [];
  const chosen = tasks.filter((t) => !excluded.has(t.id));

  function toggle(id: string) {
    const next = new Set(excluded);
    if (!next.delete(id)) next.add(id);
    setExcluded(next);
  }

  return (
    <Sheet title="Da attività esistenti" isOpen onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Field label="Dal" htmlFor="tpl-from">
            <input id="tpl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Al" htmlFor="tpl-to">
            <input id="tpl-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {!valid ? (
          <p className="text-sm text-text-2">Scegli un periodo valido.</p>
        ) : query.isPending ? (
          <p className="text-sm text-text-3">Carico…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-text-2">Nessuna attività con un giorno in questo periodo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {tasks.map((t) => (
              <li key={t.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="checkbox" checked={!excluded.has(t.id)} onChange={() => toggle(t.id)} className="size-5 shrink-0 accent-(--accent-fill)" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-text-3">
                    {shortDate(t.date!)}
                    {t.time ? ` · ${t.time.slice(0, 5)}` : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-text-3">Il primo giorno scelto diventa il giorno di partenza. Poi puoi dare un nome e ritoccare le voci.</p>
        <div className="flex justify-end">
          <Button variant="primary" disabled={chosen.length === 0} onClick={() => onPick(itemsFromTasks(chosen))}>
            Continua
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
