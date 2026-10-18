import { uuidv7 } from "../ids";
import type { LocalDate } from "../dates/local";
import { getSupabase } from "../supabase/client";
import type { Area, LaundryLoad, Task, WardrobeItem, WashGroup } from "../supabase/types";
import { commit, withPendingLoads, withPendingTasks } from "../sync/engine";
import { byId, type Op } from "../sync/ops";
import { laundryTaskTitle } from "../wardrobe/laundry";
import { queryClient } from "./query-client";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const LOADS_KEY = ["laundry-loads"];
/** Sotto "tasks": la cache segue da sola le modifiche alle attività. Chi legge filtra con `plannedLaundry`. */
export const LAUNDRY_TASKS_KEY = ["tasks", "laundry"];

export async function fetchLoads(): Promise<LaundryLoad[]> {
  const rows: LaundryLoad[] = check(
    await getSupabase()
      .from("laundry_loads")
      .select("id, wash_group, washed_on, item_ids, task_id, created_at")
      .order("washed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  );
  return withPendingLoads(rows);
}

/** Le lavatrici ancora da fare: create dall'app o scritte a mano ("Lavatrice scuri", "bucato"). */
export async function fetchLaundryTasks(): Promise<Task[]> {
  const rows: Task[] = check(
    await getSupabase()
      .from("tasks")
      .select("*")
      .is("deleted_at", null)
      .eq("status", "open")
      .eq("is_private", false)
      .or("source.eq.laundry,title.ilike.*lavatric*,title.ilike.*bucato*,title.ilike.*lavaggio*"),
  );
  return withPendingTasks(rows);
}

/** L'area "Casa", se c'è: la lavatrice ci appartiene. */
function homeArea(): string | null {
  const areas = queryClient.getQueryData<Area[]>(["areas"]) ?? [];
  return areas.find((a) => !a.archived_at && a.name.trim().toLowerCase() === "casa")?.id ?? null;
}

/** Pianifica la lavatrice di un gruppo: un'attività nel giorno (e all'ora) scelti. */
export async function planLaundry(group: WashGroup, date: LocalDate, time: string | null): Promise<string> {
  const id = uuidv7();
  await commit([
    {
      kind: "insert",
      table: "tasks",
      row: { id, title: laundryTaskTitle(group), date, time, area_id: homeArea(), source: "laundry", laundry_group: group },
    },
  ]);
  return id;
}

/** Lavatrice fatta: i capi scelti tornano puliti e la lavatrice entra nello storico. Restituisce l'id, per annullare. */
export async function recordLoad(group: WashGroup | null, washedOn: LocalDate, items: WardrobeItem[], taskId: string | null): Promise<string> {
  const id = uuidv7();
  const ops: Op[] = [{ kind: "insert", table: "laundry_loads", row: { id, wash_group: group, washed_on: washedOn, item_ids: items.map((i) => i.id), task_id: taskId } }];
  for (const item of items) {
    if (item.status !== "clean") ops.push({ kind: "update", table: "wardrobe_items", patch: { status: "clean" }, where: byId(item.id), snapshot: { ...item, status: "clean" } });
  }
  await commit(ops);
  return id;
}

/** Annulla una lavatrice appena registrata: i capi tornano com'erano (`items` è lo stato di prima). */
export async function undoLoad(loadId: string, items: WardrobeItem[]): Promise<void> {
  const ops: Op[] = [{ kind: "delete", table: "laundry_loads", where: byId(loadId) }];
  for (const item of items) {
    if (item.status !== "clean") ops.push({ kind: "update", table: "wardrobe_items", patch: { status: item.status }, where: byId(item.id), snapshot: item });
  }
  await commit(ops);
}
