import type { ShoppingItem } from "../supabase/types";
import { normalizeName } from "./entry";
import { NO_DEPARTMENT, compareDepartments, departmentOf } from "./list";

/**
 * "In casa": ciò che è stato comprato (spuntato nella Spesa) e non è ancora finito.
 * Vale anche per gli articoli già tolti dalla lista con "Svuota completati".
 */
export function inPantry(item: Pick<ShoppingItem, "checked" | "finished_at">): boolean {
  return item.checked && !item.finished_at;
}

/** Un ingrediente in casa: gli acquisti dello stesso prodotto contano come una voce sola. */
export type PantryEntry = { key: string; name: string; quantity: string | null; department: string | null; items: ShoppingItem[] };
export type PantryGroup = { department: string; entries: PantryEntry[] };

/** Reparti di cose che non si mangiano (pellicola, cibo del gatto, cura della persona): non sono ingredienti. */
const NOT_FOOD: readonly string[] = ["Casa", "Cura della persona"];

/** Se un prodotto di questo reparto conta come ingrediente per i pasti. */
export function isFood(department: string | null): boolean {
  return !department || !NOT_FOOD.includes(department);
}

function boughtAt(item: ShoppingItem): string {
  return item.checked_at ?? item.created_at;
}

/**
 * Gli ingredienti in casa per reparto (stesso ordine della Spesa), in ordine alfabetico; nome e quantità dell'acquisto più recente.
 * Restano fuori le cose che non si mangiano (reparti "Casa" e "Cura della persona").
 */
export function pantryGroups(items: ShoppingItem[]): PantryGroup[] {
  const byName = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (!inPantry(item)) continue;
    const key = normalizeName(item.name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  const byDepartment = new Map<string, PantryEntry[]>();
  for (const [key, same] of byName) {
    const latest = same.reduce((a, b) => (boughtAt(b) > boughtAt(a) ? b : a));
    const department = departmentOf(latest.name, latest.department);
    if (!isFood(department)) continue;
    const group = department ?? NO_DEPARTMENT;
    byDepartment.set(group, [...(byDepartment.get(group) ?? []), { key, name: latest.name.trim(), quantity: latest.quantity, department, items: same }]);
  }
  return [...byDepartment.entries()]
    .map(([department, entries]) => ({ department, entries: entries.sort((a, b) => a.key.localeCompare(b.key, "it")) }))
    .sort((a, b) => compareDepartments(a.department, b.department));
}

export function pantryCount(groups: PantryGroup[]): number {
  return groups.reduce((n, g) => n + g.entries.length, 0);
}
