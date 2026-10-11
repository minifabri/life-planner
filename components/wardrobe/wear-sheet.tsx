"use client";

import { useState } from "react";
import { Button, Segmented } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { WardrobePhoto } from "@/components/wardrobe/photo";
import type { WearChoice } from "@/lib/data/outfits";
import { CATEGORY_LABEL, STATUSES } from "@/lib/wardrobe/categories";
import { statusAfterWear } from "@/lib/wardrobe/outfits";
import type { WardrobeItem, WardrobeStatus } from "@/lib/supabase/types";

const AFTER_LABEL: Record<WardrobeStatus, string> = { clean: "Pulito", worn: "Riutilizzabile", to_wash: "Da lavare" };

/** "Indossato oggi": per ogni capo si sceglie se è ancora riutilizzabile o da lavare. Niente diventa sporco da solo. */
export function WearSheet({ items, onConfirm, onClose }: { items: WardrobeItem[]; onConfirm: (choices: WearChoice[]) => Promise<boolean>; onClose: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, WardrobeStatus>>(() => Object.fromEntries(items.map((i) => [i.id, statusAfterWear(i)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    if (!(await onConfirm(items.map((item) => ({ item, status: statuses[item.id] }))))) {
      setBusy(false);
      setError("Non è stato possibile registrare. Riprova.");
    }
  }

  return (
    <Sheet title="Indossato oggi" isOpen onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-2">Come restano i capi dopo oggi?</p>
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const label = item.name ?? CATEGORY_LABEL[item.category];
            return (
              <li key={item.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="size-11 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
                    <WardrobePhoto item={item} />
                  </span>
                  <span className="line-clamp-1 text-sm">{label}</span>
                </div>
                <Segmented
                  label={`Stato di ${label}`}
                  value={statuses[item.id]}
                  options={STATUSES.map((s) => ({ value: s, label: AFTER_LABEL[s] }))}
                  onChange={(status) => setStatuses((prev) => ({ ...prev, [item.id]: status }))}
                />
              </li>
            );
          })}
        </ul>
        {error ? (
          <p role="alert" className="text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            Registra
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
