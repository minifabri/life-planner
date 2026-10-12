"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { rowsNote, type DayRow, type DaySummary } from "@/lib/meals/micros";
import { listText } from "@/lib/meals/nutrients";

function mealsText(count: number): string {
  return count === 1 ? "1 pasto" : `${count} pasti`;
}

/** Le barre di un gruppo: un segmento per ogni pasto riconosciuto del giorno, pieno per quelli che portano il nutriente. */
function Bars({ title, rows, total }: { title: string; rows: DayRow<string>[]; total: number }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="label-mono">{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="flex h-7 items-center gap-3">
            <span className={`w-[92px] shrink-0 text-[13px] ${row.meals === 0 ? "text-text-3" : "text-text-2"}`}>{row.label}</span>
            <span aria-hidden className="flex flex-1 gap-[3px]">
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < row.meals ? "bg-text-2" : "bg-surface-2"}`} />
              ))}
            </span>
            <span aria-hidden className="w-7 shrink-0 text-right font-mono text-[11px] text-text-3">
              {row.meals}/{total}
            </span>
            <span className="sr-only">
              : {row.meals === 0 ? "in nessun pasto" : `in ${mealsText(row.meals)} su ${total}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Nutrienti e micronutrienti del giorno. Chiuso è una riga discreta che dice cosa c'è e cosa manca;
 * aperto mostra, per ciascuno, in quanti pasti del giorno compare.
 */
export function DayNutrients({ summary }: { summary: DaySummary }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (summary.recognized === 0) return null;

  const present = summary.nutrients.filter((r) => r.meals > 0).map((r) => r.label.toLowerCase());
  const missing = summary.nutrients.filter((r) => r.meals === 0).map((r) => r.label.toLowerCase());
  const micros = rowsNote(summary.micros);

  return (
    <section aria-label="Nutrienti del giorno" className="-mt-1 flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
        className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-xs text-text-3 hover:bg-surface-2"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {present.length > 0 ? (
            <span>
              Nel giorno: {listText(present)}.{missing.length > 0 ? ` ${missing.length === 1 ? "Manca" : "Mancano"}: ${listText(missing)}.` : ""}
            </span>
          ) : null}
          <span>Micronutrienti: {micros ?? "i nomi dei piatti non ne indicano"}.</span>
        </span>
        <span className="sr-only">{open ? "Chiudi il dettaglio" : "Apri il dettaglio"}</span>
        <Icon name="chevronRight" size={16} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? (
        <div id={panel} className="mt-1 flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
          <Bars title="Nutrienti" rows={summary.nutrients} total={summary.recognized} />
          <Bars title="Micronutrienti" rows={summary.micros} total={summary.recognized} />
          <p className="text-xs text-text-3">
            {summary.recognized === summary.planned
              ? `Su ${mealsText(summary.planned)} del giorno.`
              : `Su ${summary.recognized} di ${mealsText(summary.planned)}: degli altri il nome non dice nulla.`}{" "}
            Sono le buone fonti che compaiono nei nomi dei piatti, non le quantità.
          </p>
        </div>
      ) : null}
    </section>
  );
}
