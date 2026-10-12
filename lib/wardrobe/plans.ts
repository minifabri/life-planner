import type { LocalDate } from "../dates/local";
import type { Outfit, OutfitPlan, WardrobeItem } from "../supabase/types";
import { resolveItems, toWashCount } from "./outfits";

/** Le pianificazioni da `today` in avanti, dal giorno più vicino; nello stesso giorno, nell'ordine in cui sono nate. */
export function upcomingPlans(plans: OutfitPlan[], today: LocalDate): OutfitPlan[] {
  return plans.filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

export function plansForDay(plans: OutfitPlan[], day: LocalDate): OutfitPlan[] {
  return upcomingPlans(plans, day).filter((p) => p.date === day);
}

export type ResolvedPlan = {
  plan: OutfitPlan;
  /** L'outfit salvato da cui nasce, se esiste ancora. */
  outfit: Outfit | null;
  itemIds: string[];
  items: WardrobeItem[];
  missing: number;
};

/**
 * I capi di una pianificazione: quelli dell'outfit salvato finché esiste (così una modifica all'outfit si vede),
 * altrimenti quelli fissati al momento della pianificazione.
 */
export function resolvePlan(plan: OutfitPlan, outfits: Outfit[], items: WardrobeItem[]): ResolvedPlan {
  const outfit = (plan.outfit_id && outfits.find((o) => o.id === plan.outfit_id && !o.deleted_at)) || null;
  const itemIds = outfit ? outfit.item_ids : plan.item_ids;
  return { plan, outfit, itemIds, ...resolveItems(itemIds, items) };
}

/** Problemi da segnalare, senza toccare la scelta: capi da lavare o non più nel guardaroba. */
export function planIssues(resolved: Pick<ResolvedPlan, "items" | "missing">): string[] {
  const issues: string[] = [];
  const toWash = toWashCount(resolved.items);
  if (toWash > 0) issues.push(toWash === 1 ? "Un capo è da lavare" : `${toWash} capi sono da lavare`);
  if (resolved.missing > 0) issues.push(resolved.missing === 1 ? "Un capo non è più nel guardaroba" : `${resolved.missing} capi non sono più nel guardaroba`);
  return issues;
}

/** Come chiamare una pianificazione: l'occasione, poi il nome dell'outfit, poi un nome generico. */
export function planTitle(resolved: Pick<ResolvedPlan, "plan" | "outfit">): string {
  return resolved.plan.label?.trim() || resolved.outfit?.name || "Outfit";
}
