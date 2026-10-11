"use client";

import { useState } from "react";
import Link from "next/link";
import { ApplySheet } from "@/components/templates/apply-sheet";
import { FromTasksSheet } from "@/components/templates/from-tasks-sheet";
import { TemplateSheet } from "@/components/templates/template-sheet";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useAreas, useInvalidateDay, useTemplates, useTimezone, useToday } from "@/lib/data/hooks";
import { applyTemplateFrom, deleteTemplate, removeAppliedTasks, saveTemplate } from "@/lib/data/templates";
import { relativeDay, type LocalDate } from "@/lib/dates/local";
import type { Template, TemplateItem } from "@/lib/supabase/types";
import { templateSummary } from "@/lib/templates/apply";

type Editing = { template: Template | null; items?: TemplateItem[] };

export default function TemplatesPage() {
  const tz = useTimezone();
  const { today } = useToday(tz);
  const templates = useTemplates();
  const areas = useAreas().data ?? [];
  const invalidateDay = useInvalidateDay();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [applying, setApplying] = useState<Template | null>(null);
  const [picking, setPicking] = useState(false);

  /** Le modifiche ai template vogliono la rete: l'esito dice al foglio se chiudersi o avvisare. */
  async function attempt(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      setEditing(null);
      return true;
    } catch {
      return false;
    }
  }

  async function apply(template: Template, start: LocalDate) {
    try {
      const ids = await applyTemplateFrom(template, start, areas);
      setApplying(null);
      invalidateDay();
      toast({
        message: `${ids.length === 1 ? "1 attività creata" : `${ids.length} attività create`} da ${relativeDay(start, today)}.`,
        actionLabel: "Annulla",
        onAction: () => {
          removeAppliedTasks(ids)
            .then(invalidateDay)
            .catch(() => toast({ message: "Non è stato possibile annullare.", tone: "warn" }));
        },
      });
    } catch {
      toast({ message: "Attività non create. Riprova.", tone: "warn" });
    }
  }

  const list = templates.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-5 md:px-10 md:py-7">
      <Link href="/settings" className="-ml-2.5 -mb-3 flex min-h-11 items-center gap-1 self-start rounded-lg px-2.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text">
        <Icon name="chevronLeft" size={16} />
        Impostazioni
      </Link>
      <PageHeader
        eyebrow="Impostazioni"
        title="Template"
        actions={
          <Button variant="primary" onClick={() => setEditing({ template: null })}>
            Nuovo
          </Button>
        }
      />

      {templates.isPending ? (
        <p className="text-sm text-text-3" aria-busy="true">
          Carico…
        </p>
      ) : templates.isError && list.length === 0 ? (
        <EmptyState title="Template non disponibili" hint="Serve la connessione per caricarli la prima volta." />
      ) : list.length === 0 ? (
        <EmptyState title="Nessun template" hint="Crea un gruppo di attività da ripetere: scegli il giorno di partenza e nascono tutte insieme." />
      ) : (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px]">{t.name}</span>
                <span className="text-xs text-text-3">{templateSummary(t.items)}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setEditing({ template: t })}>Modifica</Button>
                <Button onClick={() => setApplying(t)} disabled={t.items.length === 0}>
                  Applica
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button variant="quiet" onClick={() => setPicking(true)} className="-ml-4">
          Crea da attività esistenti
        </Button>
      </div>

      {editing ? (
        <TemplateSheet
          // Un foglio nuovo per ogni template: lo stato del modulo riparte da capo.
          key={editing.template?.id ?? "new"}
          template={editing.template}
          initialItems={editing.items}
          areas={areas}
          onSave={(name, items) => attempt(() => saveTemplate(editing.template?.id ?? null, name, items))}
          onDelete={() => attempt(() => deleteTemplate(editing.template!.id))}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {applying ? <ApplySheet template={applying} today={today} onApply={(start) => apply(applying, start)} onClose={() => setApplying(null)} /> : null}
      {picking ? (
        <FromTasksSheet
          today={today}
          tz={tz}
          onPick={(items) => {
            setPicking(false);
            setEditing({ template: null, items });
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
