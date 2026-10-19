import type { LocalDate } from "../dates/local";
import { uuidv7 } from "../ids";
import type { Area, WishlistItem } from "../supabase/types";
import { commit } from "../sync/engine";
import { arrivalOps, returnedOps, type ArrivalTarget, type ShipmentAnswer } from "../wishlist/shipments";
import { listId } from "./api";
import { queryClient } from "./query-client";

/** L'area "Acquisti", se c'è: la restituzione ci appartiene. */
function shoppingArea(): string | null {
  const areas = queryClient.getQueryData<Area[]>(["areas"]) ?? [];
  return areas.find((a) => !a.archived_at && a.name.trim().toLowerCase() === "acquisti")?.id ?? null;
}

/** Salva la risposta su un pacco arrivato. Restituisce la funzione che la annulla. */
export async function answerArrival(target: ArrivalTarget, answer: ShipmentAnswer, today: LocalDate): Promise<() => Promise<void>> {
  const list = target.item ? target.item.list_id : await listId("wishlist");
  const { ops, undo } = arrivalOps(target, answer, { today, itemId: uuidv7(), taskId: uuidv7(), answerId: uuidv7(), listId: list, areaId: shoppingArea() });
  await commit(ops);
  return () => commit(undo);
}

/** Segna come restituito un articolo da restituire, e chiude la sua attività. */
export async function markReturned(item: WishlistItem): Promise<() => Promise<void>> {
  const { ops, undo } = returnedOps(item, new Date().toISOString());
  await commit(ops);
  return () => commit(undo);
}
