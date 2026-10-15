"use client";

import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Icon } from "@/components/ui/icon";
import { departmentOf } from "@/lib/shopping/list";
import type { ShoppingItem } from "@/lib/supabase/types";

/** Tutto il quadratino è la spunta; i tre puntini aprono la modifica. */
export function ItemTile({ item, onToggle, onEdit }: { item: ShoppingItem; onToggle: () => void; onEdit: () => void }) {
  return (
    <li
      style={departmentStyle(departmentOf(item.name, item.department))}
      className={`rise relative rounded-2xl border ${item.checked ? "border-line bg-surface" : "dept-tint"}`}
    >
      <label className="flex aspect-square cursor-pointer flex-col justify-between gap-1.5 rounded-2xl p-2.5 transition-transform duration-200 ease-out-soft active:scale-[0.96] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent">
        <input
          type="checkbox"
          className="sr-only"
          checked={item.checked}
          onChange={onToggle}
          aria-label={item.checked ? `Rimetti in lista: ${item.name}` : `Preso: ${item.name}${item.urgent ? ", urgente" : ""}`}
        />
        {item.checked ? (
          <span className="flex size-[26px] items-center justify-center rounded-lg bg-accent-fill text-on-accent">
            <Icon name="check" size={15} strokeWidth={2.4} className="pop" />
          </span>
        ) : (
          <span className="flex h-[26px] items-center text-(--dept)">
            <ProductIcon name={item.name} department={item.department} size={26} />
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`line-clamp-2 break-words text-[13px] leading-[1.25] ${item.checked ? "text-text-3 line-through" : "text-text"}`}>
            {item.name}
          </span>
          {item.quantity || (item.urgent && !item.checked) ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] leading-none text-text-2">
              {item.urgent && !item.checked ? (
                <span className="flex items-center gap-1 text-gold">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
                  urgente
                </span>
              ) : null}
              {item.quantity}
            </span>
          ) : null}
        </span>
      </label>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifica: ${item.name}`}
        className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-2xl text-text-3 hover:text-text"
      >
        <Icon name="more" size={16} />
      </button>
    </li>
  );
}
