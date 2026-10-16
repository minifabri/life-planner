"use client";

import { Icon } from "@/components/ui/icon";

/** Mostra o nasconde i capi fuori stagione: restano a un tocco, sotto quelli di stagione. */
export function OffSeasonToggle({ count, open, controls, onToggle }: { count: number; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="-mx-1 flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-sm text-text-2 hover:text-text"
    >
      {open ? "Nascondi i capi fuori stagione" : `Fuori stagione · ${count}`}
      <Icon name="chevronRight" size={14} className={open ? "-rotate-90" : "rotate-90"} />
    </button>
  );
}
