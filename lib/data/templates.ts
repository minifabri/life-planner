import { uuidv7 } from "../ids";
import type { LocalDate } from "../dates/local";
import { getSupabase } from "../supabase/client";
import type { Area, Task, Template, TemplateItem } from "../supabase/types";
import { commit } from "../sync/engine";
import { byId, type Op } from "../sync/ops";
import { applyTemplate, cleanItems, parseItems } from "../templates/apply";
import { queryClient } from "./query-client";

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** I template, in ordine di nome. Restano in cache: si possono applicare anche senza rete. */
export async function fetchTemplates(): Promise<Template[]> {
  const rows: { id: string; name: string; items: unknown }[] = check(await getSupabase().from("templates").select("id, name, items").order("name"));
  return rows.map((r) => ({ id: r.id, name: r.name, items: parseItems(r.items) }));
}

function refresh() {
  return queryClient.invalidateQueries({ queryKey: ["templates"] });
}

/** Crea o modifica un template. Solo con la rete, come le altre impostazioni. */
export async function saveTemplate(id: string | null, name: string, items: TemplateItem[]): Promise<void> {
  const row = { name: name.trim(), items: cleanItems(items) };
  const table = getSupabase().from("templates");
  check(id ? await table.update(row).eq("id", id).select("id") : await table.insert({ id: uuidv7(), ...row }).select("id"));
  await refresh();
}

export async function deleteTemplate(id: string): Promise<void> {
  check(await getSupabase().from("templates").delete().eq("id", id).select("id"));
  await refresh();
}

/**
 * Applica il template dal giorno `start`: le attività passano dalla outbox come le altre, quindi vale anche offline.
 * Restituisce gli id creati, per poter annullare.
 */
export async function applyTemplateFrom(template: Pick<Template, "items">, start: LocalDate, areas: Pick<Area, "id">[]): Promise<string[]> {
  const rows = applyTemplate(template.items, start, new Set(areas.map((a) => a.id))).map(
    (task): Partial<Task> & { id: string } => ({ id: uuidv7(), ...task, source: "template" }),
  );
  if (rows.length === 0) return [];
  await commit(rows.map((row): Op => ({ kind: "insert", table: "tasks", row })));
  return rows.map((r) => r.id);
}

/** Annulla un'applicazione appena fatta. */
export async function removeAppliedTasks(ids: string[]): Promise<void> {
  const deleted_at = new Date().toISOString();
  await commit(ids.map((id): Op => ({ kind: "update", table: "tasks", patch: { deleted_at }, where: byId(id) })));
}
