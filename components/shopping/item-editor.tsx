"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { DEPARTMENTS, NO_DEPARTMENT } from "@/lib/shopping/list";
import type { ShoppingItem } from "@/lib/supabase/types";

type Change = Pick<ShoppingItem, "name" | "quantity" | "department">;

export function ItemEditor({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: ShoppingItem;
  onSave: (change: Change) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [department, setDepartment] = useState(item.department);

  // Un reparto arrivato da fuori (non tra quelli proposti) resta selezionabile.
  const known = (DEPARTMENTS as readonly string[]).includes(item.department ?? "");
  const options: (string | null)[] = [...DEPARTMENTS, ...(item.department && !known ? [item.department] : []), null];

  return (
    <Sheet title="Modifica articolo" isOpen onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ name: name.trim(), quantity: quantity.trim() || null, department });
          onClose();
        }}
      >
        <div className="flex gap-3">
          <Field label="Nome" htmlFor="shopping-name">
            <input
              id="shopping-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              enterKeyHint="done"
              className={inputClass}
            />
          </Field>
          <div className="flex w-28 shrink-0">
            <Field label="Quantità" htmlFor="shopping-quantity">
              <input
                id="shopping-quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="2, 500 g…"
                autoComplete="off"
                enterKeyHint="done"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="shopping-department" className="text-xs text-text-2">
            Reparto
          </span>
          <div role="group" aria-labelledby="shopping-department" className="flex flex-wrap gap-1.5">
            {options.map((option) => {
              const on = department === option;
              return (
                <button
                  key={option ?? NO_DEPARTMENT}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDepartment(option)}
                  className={`min-h-11 rounded-xl border px-3 text-sm ${
                    on ? "border-accent bg-accent-soft text-text" : "border-line-2 text-text-2"
                  }`}
                >
                  {option ?? NO_DEPARTMENT}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-3">La prossima volta questo articolo andrà da solo nel suo reparto.</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="quiet"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Elimina
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Salva
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
