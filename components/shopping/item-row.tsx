"use client";

import { Icon } from "@/components/ui/icon";
import type { ShoppingItem } from "@/lib/supabase/types";

/** Tutta la riga è la spunta; i tre puntini aprono la modifica. */
export function ItemRow({ item, onToggle, onEdit }: { item: ShoppingItem; onToggle: () => void; onEdit: () => void }) {
  return (
    <li className="flex items-center gap-1 border-b border-line last:border-b-0">
      <label className="-ml-2.5 flex min-h-11 min-w-0 flex-1 cursor-pointer items-center">
        <span className="flex size-11 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={item.checked}
            onChange={onToggle}
            aria-label={item.checked ? `Rimetti in lista: ${item.name}` : `Preso: ${item.name}`}
          />
          <span
            className={`flex size-[22px] items-center justify-center rounded-[7px] border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
              item.checked ? "border-accent-fill bg-accent-fill text-on-accent" : "border-line-2 text-transparent"
            }`}
          >
            <Icon name="check" size={14} strokeWidth={2.2} />
          </span>
        </span>
        <span className={`min-w-0 break-words py-2 text-[15px] leading-snug ${item.checked ? "text-text-3 line-through" : "text-text"}`}>
          {item.name}
        </span>
        {item.quantity ? <span className="ml-2 shrink-0 font-mono text-xs text-text-3">{item.quantity}</span> : null}
      </label>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifica: ${item.name}`}
        className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-text-3 hover:bg-surface-2 hover:text-text"
      >
        <Icon name="more" size={18} />
      </button>
    </li>
  );
}
