"use client";

import { useState } from "react";
import { ProductIcon, departmentStyle } from "@/components/shopping/product-icon";
import { Icon } from "@/components/ui/icon";
import { usePantryItems, useShoppingActions } from "@/lib/data/shopping-hooks";
import { pantryCount, pantryGroups } from "@/lib/shopping/pantry";

/**
 * "In casa": gli ingredienti comprati (spuntati nella Spesa) e non ancora finiti, da usare per i pasti.
 * Chiusa di default; "Finito" toglie un ingrediente dall'elenco.
 */
export function PantrySection() {
  const query = usePantryItems();
  const actions = useShoppingActions();
  const [open, setOpen] = useState(false);

  if (query.data === undefined) return null;
  const groups = pantryGroups(query.data);
  const count = pantryCount(groups);

  return (
    <section className="flex flex-col">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 text-sm text-text-2 hover:text-text"
        >
          <span>In casa{count > 0 ? ` · ${count === 1 ? "1 ingrediente" : `${count} ingredienti`}` : ""}</span>
          <Icon name="chevronRight" size={16} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </h2>
      {open ? (
        count === 0 ? (
          <p className="px-1 pt-3 text-sm text-text-3">Ancora niente. Quello che spunti nella Spesa compare qui, pronto per i tuoi pasti.</p>
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            {groups.map((group) => (
              <section key={group.department} aria-label={group.department} className="flex flex-col gap-1" style={departmentStyle(group.department)}>
                <h3 className="label-mono flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-(--dept)" />
                  {group.department}
                  <span className="font-normal">· {group.entries.length}</span>
                </h3>
                <ul className="flex flex-col">
                  {group.entries.map((entry) => (
                    <li key={entry.key} className="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0">
                      <span className="flex shrink-0 text-(--dept)">
                        <ProductIcon name={entry.name} department={entry.department} size={20} />
                      </span>
                      <span className="min-w-0 flex-1 break-words py-1.5 text-[15px]">{entry.name}</span>
                      {entry.quantity ? <span className="shrink-0 font-mono text-[11px] text-text-2">{entry.quantity}</span> : null}
                      <button
                        type="button"
                        onClick={() => actions.finish(entry.name, entry.items)}
                        aria-label={`Finito: ${entry.name}`}
                        className="-mr-2.5 min-h-11 shrink-0 rounded-lg px-2.5 text-[13px] text-text-2 hover:bg-surface-2 hover:text-text"
                      >
                        Finito
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
