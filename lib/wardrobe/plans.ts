import { addDays, type LocalDate } from "../dates/local";
import type { Outfit, OutfitPlan, WardrobeItem, WardrobeWear } from "../supabase/types";
import { bandOf, type DayForecast } from "../weather/forecast";
import { resolveItems, toWashCount } from "./outfits";
import { thermalMismatch, type Band } from "./suggest";

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

const BAND_DAY: Record<Band, string> = { cold: "una giornata fredda", mild: "una giornata mite", warm: "una giornata calda" };

/** Se l'outfit stona con la previsione di quel giorno, lo dice; non tocca la scelta. `null` se va bene o non si può dire. */
export function weatherIssue(items: WardrobeItem[], forecast: DayForecast | null): string | null {
  if (!forecast) return null;
  const band = bandOf(forecast);
  const mismatch = thermalMismatch(items, band);
  if (!mismatch) return null;
  return `Forse ${mismatch === "light" ? "leggero" : "pesante"} per ${BAND_DAY[band]}`;
}

/** Come chiamare una pianificazione: l'occasione, poi il nome dell'outfit, poi un nome generico. */
export function planTitle(resolved: Pick<ResolvedPlan, "plan" | "outfit">): string {
  return resolved.plan.label?.trim() || resolved.outfit?.name || "Outfit";
}

/**
 * Una pianificazione risulta indossata se il suo giorno c'è un utilizzo dello stesso outfit salvato,
 * oppure con almeno metà dei suoi capi.
 */
export function isPlanWorn(resolved: Pick<ResolvedPlan, "plan" | "outfit" | "itemIds">, wears: WardrobeWear[]): boolean {
  return wears.some((w) => {
    if (w.worn_on !== resolved.plan.date) return false;
    if (resolved.outfit && w.outfit_id === resolved.outfit.id) return true;
    if (resolved.itemIds.length === 0) return false;
    const shared = resolved.itemIds.filter((id) => w.item_ids.includes(id)).length;
    return shared * 2 >= resolved.itemIds.length;
  });
}

/**
 * Gli outfit di ieri su cui chiedere "Lo hai indossato?": pianificati, con dei capi, non ancora registrati
 * come indossati e senza una risposta "No" (`dismissed`, id delle pianificazioni). L'app chiede, non decide.
 */
export function plansToConfirm(plans: OutfitPlan[], outfits: Outfit[], items: WardrobeItem[], wears: WardrobeWear[], today: LocalDate, dismissed: string[]): ResolvedPlan[] {
  const yesterday = addDays(today, -1);
  return plans
    .filter((p) => p.date === yesterday && !dismissed.includes(p.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => resolvePlan(p, outfits, items))
    .filter((r) => r.items.length > 0 && !isPlanWorn(r, wears));
}
