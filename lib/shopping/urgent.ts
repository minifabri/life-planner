import { addDays, type LocalDate } from "../dates/local";
import type { ShoppingItem, Task } from "../supabase/types";
import { byId, type Op } from "../sync/ops";

/**
 * Articoli urgenti della Spesa: segnarne uno crea un'attività "Comprare …" da completare entro
 * `URGENT_DAYS` giorni, con attenzione alta. Articolo e attività restano allineati (comprato ↔ completata,
 * eliminato ↔ eliminata, rinominato ↔ titolo nuovo). Le funzioni restituiscono operazioni per la outbox;
 * il database applica le stesse regole con dei trigger (migrazione 20261015110000_shopping_urgent.sql).
 */
export const URGENT_DAYS = 2;

type UrgentKey = Pick<ShoppingItem, "id" | "name" | "urgent" | "task_id">;

export function urgentTaskTitle(name: string): string {
  return `Comprare ${name.trim()}`;
}

/** L'attività di un articolo urgente: nel periodo da oggi a dopodomani, in Today fin da subito. */
export function urgentTaskRow(item: Pick<ShoppingItem, "id" | "name">, taskId: string, today: LocalDate) {
  return {
    id: taskId,
    title: urgentTaskTitle(item.name),
    window_start: today,
    due_date: addDays(today, URGENT_DAYS),
    attention: "high" as const,
    source: "shopping" as const,
    shopping_item_id: item.id,
  };
}

/** Urgente sì/no. `taskId` è l'id da dare all'attività nuova. */
export function setUrgentOps(item: UrgentKey & Pick<ShoppingItem, "checked">, urgent: boolean, taskId: string, today: LocalDate, now: string): Op[] {
  if (urgent === item.urgent) return [];
  if (!urgent) {
    return [
      { kind: "update", table: "shopping_items", patch: { urgent: false, task_id: null }, where: byId(item.id) },
      ...(item.task_id ? [removeTaskOp(item.task_id, now)] : []),
    ];
  }
  // Già nel carrello: non c'è più niente da comprare, l'articolo si segna e basta.
  if (item.checked) return [{ kind: "update", table: "shopping_items", patch: { urgent: true }, where: byId(item.id) }];
  return [
    { kind: "insert", table: "tasks", row: urgentTaskRow(item, taskId, today) },
    { kind: "update", table: "shopping_items", patch: { urgent: true, task_id: taskId }, where: byId(item.id) },
  ];
}

/** Elimina l'attività solo se è ancora da fare: una già completata resta nella sua giornata. */
function removeTaskOp(taskId: string, now: string): Op {
  return {
    kind: "update",
    table: "tasks",
    patch: { deleted_at: now },
    where: [
      ["id", "eq", taskId],
      ["status", "eq", "open"],
    ],
  };
}

/** Articolo spuntato (o rimesso in lista): l'attività segue. */
export function itemToggledOps(item: Pick<ShoppingItem, "task_id">, checked: boolean, now: string): Op[] {
  if (!item.task_id) return [];
  return [
    {
      kind: "update",
      table: "tasks",
      patch: checked ? { status: "done", completed_at: now } : { status: "open", completed_at: null },
      where: byId(item.task_id),
    },
  ];
}

/** Articoli tolti dalla lista: via le loro attività ancora da fare. */
export function itemsRemovedOps(items: Pick<ShoppingItem, "task_id">[], now: string): Op[] {
  return items.flatMap((i) => (i.task_id ? [removeTaskOp(i.task_id, now)] : []));
}

/** Eliminazione annullata: tornano anche le attività ancora da fare. */
export function itemsRestoredOps(items: Pick<ShoppingItem, "task_id">[]): Op[] {
  return items.flatMap((i): Op[] =>
    i.task_id
      ? [
          {
            kind: "update",
            table: "tasks",
            patch: { deleted_at: null },
            where: [
              ["id", "eq", i.task_id],
              ["status", "eq", "open"],
            ],
          },
        ]
      : [],
  );
}

/** Articolo rinominato: anche l'attività cambia titolo. */
export function itemRenamedOps(item: Pick<ShoppingItem, "task_id">, name: string): Op[] {
  if (!item.task_id) return [];
  return [{ kind: "update", table: "tasks", patch: { title: urgentTaskTitle(name) }, where: byId(item.task_id) }];
}

type ShoppingTask = Pick<Task, "id" | "source" | "shopping_item_id">;

function isShoppingTask(task: ShoppingTask): task is ShoppingTask & { shopping_item_id: string } {
  return task.source === "shopping" && !!task.shopping_item_id;
}

/** Attività completata (o rimessa da fare) in Today: l'articolo va nel carrello (o torna in lista). */
export function shoppingTaskToggledOps(task: ShoppingTask, done: boolean, now: string): Op[] {
  if (!isShoppingTask(task)) return [];
  return [
    {
      kind: "update",
      table: "shopping_items",
      patch: done ? { checked: true, checked_at: now } : { checked: false, checked_at: null },
      where: byId(task.shopping_item_id),
    },
  ];
}

/** Attività eliminata in Today: l'articolo resta in lista, non più urgente. */
export function shoppingTaskRemovedOps(task: ShoppingTask): Op[] {
  if (!isShoppingTask(task)) return [];
  return [
    {
      kind: "update",
      table: "shopping_items",
      patch: { urgent: false, task_id: null },
      where: [
        ["id", "eq", task.shopping_item_id],
        ["task_id", "eq", task.id],
      ],
    },
  ];
}

/** Eliminazione annullata: l'articolo torna urgente con la sua attività. */
export function shoppingTaskRestoredOps(task: ShoppingTask): Op[] {
  if (!isShoppingTask(task)) return [];
  return [{ kind: "update", table: "shopping_items", patch: { urgent: true, task_id: task.id }, where: byId(task.shopping_item_id) }];
}
