import type { ProductMemory, ShoppingItem } from "../supabase/types";
import { normalizeName } from "./entry";

/** Reparti proposti, nell'ordine in cui compaiono nella lista. Chi non ne ha finisce in "Altro". */
export const DEPARTMENTS = [
  "Frutta e verdura",
  "Frigo",
  "Pane e forno",
  "Dispensa",
  "Surgelati",
  "Bevande",
  "Casa",
  "Cura della persona",
] as const;

export const NO_DEPARTMENT = "Altro";

export type DepartmentGroup = { department: string; items: ShoppingItem[] };

function departmentRank(department: string): number {
  const i = (DEPARTMENTS as readonly string[]).indexOf(department);
  return i === -1 ? DEPARTMENTS.length : i;
}

/**
 * Articoli da comprare raggruppati per reparto (i reparti noti nel loro ordine, poi gli altri
 * in ordine alfabetico, "Altro" per ultimo) e articoli già presi, dal più recente.
 */
export function groupItems(items: ShoppingItem[]): { groups: DepartmentGroup[]; checked: ShoppingItem[] } {
  const byDepartment = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (item.checked) continue;
    const key = item.department?.trim() || NO_DEPARTMENT;
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), item]);
  }
  const groups = [...byDepartment.entries()]
    .map(([department, list]) => ({
      department,
      items: list.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => {
      if ((a.department === NO_DEPARTMENT) !== (b.department === NO_DEPARTMENT)) return a.department === NO_DEPARTMENT ? 1 : -1;
      return departmentRank(a.department) - departmentRank(b.department) || a.department.localeCompare(b.department, "it");
    });
  const checked = items
    .filter((i) => i.checked)
    .sort((a, b) => (b.checked_at ?? "").localeCompare(a.checked_at ?? "") || b.id.localeCompare(a.id));
  return { groups, checked };
}

const DAY_MS = 86_400_000;

/** Frequenza più recenza: `use_count + max(0, 30 − giorni dall'ultimo uso) / 3` (technical-design.md, 5.1). */
export function suggestionScore(product: Pick<ProductMemory, "use_count" | "last_used_at">, now: Date): number {
  if (!product.last_used_at) return product.use_count;
  const days = Math.floor((now.getTime() - new Date(product.last_used_at).getTime()) / DAY_MS);
  return product.use_count + Math.max(0, 30 - days) / 3;
}

function onList(items: ShoppingItem[]): Set<string> {
  return new Set(items.filter((i) => !i.checked).map((i) => normalizeName(i.name)));
}

/**
 * Prodotti già comprati che corrispondono a ciò che si sta scrivendo: l'inizio del nome o di una
 * sua parola ("lat" → latte di soia, "soia" → latte di soia). Esclusi quelli già in lista
 * e quelli aggiunti ma mai comprati (spesso errori di battitura).
 */
export function suggestProducts(query: string, memory: ProductMemory[], items: ShoppingItem[], now: Date, limit = 5): ProductMemory[] {
  const q = normalizeName(query);
  if (!q) return [];
  const present = onList(items);
  return memory
    .filter((product) => product.use_count > 0)
    .map((product) => ({ product, name: normalizeName(product.display_name) }))
    .filter(({ name }) => name !== q && !present.has(name) && (name.startsWith(q) || name.includes(` ${q}`)))
    .sort(
      (a, b) =>
        Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) ||
        suggestionScore(b.product, now) - suggestionScore(a.product, now) ||
        a.name.localeCompare(b.name, "it"),
    )
    .slice(0, limit)
    .map(({ product }) => product);
}

/** Storico: gli ultimi prodotti comprati che non sono in lista, dal più recente. */
export function recentProducts(memory: ProductMemory[], items: ShoppingItem[], limit = 12): ProductMemory[] {
  const present = onList(items);
  return memory
    .filter((p) => p.last_used_at && !present.has(normalizeName(p.display_name)))
    .sort((a, b) => b.last_used_at!.localeCompare(a.last_used_at!))
    .slice(0, limit);
}

/** Il reparto imparato per un nome, se c'è. */
export function learnedDepartment(name: string, memory: ProductMemory[]): string | null {
  const n = normalizeName(name);
  return memory.find((p) => normalizeName(p.display_name) === n)?.department ?? null;
}
