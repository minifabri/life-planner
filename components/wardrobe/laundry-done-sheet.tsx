"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import { useTimezone, useToday } from "@/lib/data/hooks";
import { recordLoad, undoLoad } from "@/lib/data/laundry";
import { useWardrobeItems } from "@/lib/data/wardrobe-hooks";
import { closeLaundryDone, getLaundryDone, subscribeLaundryDone, type LaundryDoneRequest } from "@/lib/nav/laundry-handoff";
import type { WardrobeItem } from "@/lib/supabase/types";
import { WASH_GROUP_LABEL, WASH_GROUP_OF, itemLabel, loadCandidates, washGroupOf } from "@/lib/wardrobe/laundry";

/** Il foglio "Lavatrice fatta", uno solo per tutta l'app: si apre con `requestLaundryDone`. */
export function LaundryDoneHost() {
  const request = useSyncExternalStore(subscribeLaundryDone, getLaundryDone, () => null);
  const items = useWardrobeItems().data;
  // Nessun capo da scegliere (guardaroba vuoto o tutto pulito): il foglio non serve, la richiesta si chiude.
  const empty = !!request && !!items && (() => {
    const { selected, optional } = loadCandidates(items, request.group);
    return selected.length + optional.length === 0;
  })();
  useEffect(() => {
    if (empty) closeLaundryDone();
  }, [empty]);
  if (!request || !items || empty) return null;
  return <LaundryDoneSheet key={`${request.group}:${request.taskId}`} request={request} items={items} />;
}

function ItemRow({ item, checked, onToggle, showGroup }: { item: WardrobeItem; checked: boolean; onToggle: () => void; showGroup: boolean }) {
  const group = washGroupOf(item);
  return (
    <li>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 py-1 hover:bg-surface-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-5 shrink-0 accent-[var(--accent-fill)]" />
        <span className="size-11 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
          <WardrobePhoto item={item} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-1 text-sm">{itemLabel(item)}</span>
          {showGroup ? <span className="text-xs text-text-3">{group ? WASH_GROUP_LABEL[group] : "Senza gruppo"}</span> : null}
        </span>
      </label>
    </li>
  );
}

/**
 * Lavatrice fatta: i capi da lavare del gruppo sono già scelti, quelli indossati dello stesso gruppo si aggiungono
 * con un tocco. L'elenco si legge adesso, non quando la lavatrice è stata pianificata. Tornano puliti solo i capi confermati.
 */
function LaundryDoneSheet({ request, items }: { request: LaundryDoneRequest; items: WardrobeItem[] }) {
  const toast = useToast();
  const { today } = useToday(useTimezone());
  // I capi si fissano all'apertura: mentre il foglio è aperto la cache può cambiare sotto.
  const [{ selected, optional }] = useState(() => loadCandidates(items, request.group));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selected.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = [...selected, ...optional];
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirm() {
    const targets = all.filter((i) => chosen.has(i.id));
    setBusy(true);
    setError(null);
    let loadId: string;
    try {
      loadId = await recordLoad(request.group, today, targets, request.taskId);
    } catch {
      setBusy(false);
      setError("Non è stato possibile salvare. Riprova.");
      return;
    }
    closeLaundryDone();
    toast({
      message: targets.length === 0 ? "Lavatrice registrata" : targets.length === 1 ? "1 capo di nuovo pulito" : `${targets.length} capi di nuovo puliti`,
      actionLabel: "Annulla",
      onAction: () => void undoLoad(loadId, targets).catch(() => toast({ message: "Non annullato. Riprova.", tone: "warn" })),
    });
  }

  const title = request.group ? `Lavatrice ${WASH_GROUP_OF[request.group]}` : "Lavatrice";

  return (
    <Sheet title={title} isOpen onClose={closeLaundryDone}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-2">{request.group ? "Quali capi tornano puliti?" : "Quali capi erano in lavatrice?"}</p>

        {selected.length > 0 ? (
          <ul aria-label="Da lavare" className="flex flex-col">
            {selected.map((item) => (
              <ItemRow key={item.id} item={item} checked={chosen.has(item.id)} onToggle={() => toggle(item.id)} showGroup={!request.group} />
            ))}
          </ul>
        ) : null}

        {optional.length > 0 ? (
          <div className="flex flex-col gap-1">
            {request.group ? <h3 className="text-xs text-text-2">Indossati, se li hai lavati</h3> : null}
            <ul aria-label={request.group ? "Indossati" : "Da lavare"} className="flex flex-col">
              {optional.map((item) => (
                <ItemRow key={item.id} item={item} checked={chosen.has(item.id)} onToggle={() => toggle(item.id)} showGroup={!request.group} />
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={closeLaundryDone}>
            Non ora
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            {chosen.size === 0 ? "Registra" : chosen.size === 1 ? "1 capo pulito" : `${chosen.size} capi puliti`}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
