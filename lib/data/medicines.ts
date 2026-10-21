import { addDays, type LocalDate } from "../dates/local";
import { uuidv7 } from "../ids";
import type { DueDose } from "../medicines/schedule";
import { getSupabase } from "../supabase/client";
import type { Medicine, MedicineDose, MedicineDoseStatus } from "../supabase/types";
import { commit, withPendingDoses, withPendingMedicines } from "../sync/engine";
import { byId, type Filter, type Op } from "../sync/ops";
import type { MedicineDraft } from "../medicines/schedule";

/** Medicine e integratori (D73). Le modifiche passano dalla outbox: si segnano anche senza rete. */
export const MEDICINES_KEY = ["medicines"];
/** Risposte dei giorni recenti: bastano per Oggi (ieri e oggi) e per lo storico del mese. */
export const DOSES_DAYS = 45;
export const dosesKey = (from: LocalDate) => ["medicine-doses", from];

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const MEDICINE_COLUMNS = "id, name, kind, morning, evening, schedule, weekdays, cycle_on, cycle_off, start_date, end_date, created_at, updated_at";
const DOSE_COLUMNS = "id, medicine_id, day, slot, status, remind_at, created_at, updated_at";

export async function fetchMedicines(): Promise<Medicine[]> {
  const rows: Medicine[] = check(await getSupabase().from("medicines").select(MEDICINE_COLUMNS).order("name"));
  return withPendingMedicines(rows);
}

export async function fetchDoses(from: LocalDate): Promise<MedicineDose[]> {
  const rows: MedicineDose[] = check(await getSupabase().from("medicine_doses").select(DOSE_COLUMNS).gte("day", from).order("day", { ascending: false }).limit(2000));
  return withPendingDoses(rows);
}

export const dosesFrom = (today: LocalDate) => addDays(today, -DOSES_DAYS);

/** Nuova medicina, o modifica di una esistente. Restituisce l'id. */
export async function saveMedicine(draft: MedicineDraft, existing: Medicine | null): Promise<string> {
  if (existing) {
    await commit([{ kind: "update", table: "medicines", patch: { ...draft }, where: byId(existing.id), snapshot: { ...existing, ...draft } }]);
    return existing.id;
  }
  const id = uuidv7();
  await commit([{ kind: "insert", table: "medicines", row: { id, ...draft } }]);
  return id;
}

/** Elimina una medicina e il suo storico. */
export async function deleteMedicine(m: Medicine): Promise<void> {
  await commit([{ kind: "delete", table: "medicines", where: byId(m.id) }]);
}

const doseWhere = (d: Pick<DueDose, "day" | "slot"> & { medicineId: string }): Filter[] => [
  ["medicine_id", "eq", d.medicineId],
  ["day", "eq", d.day],
  ["slot", "eq", d.slot],
];

/**
 * Segna la risposta per alcune dosi: presa, saltata o "ricordamelo" (con `remindAt`).
 * `current` sono le risposte già date, per l'annulla: si torna esattamente a prima.
 */
export async function answerDoses(
  items: DueDose[],
  status: MedicineDoseStatus,
  current: MedicineDose[],
  remindAt: Date | null = null,
): Promise<() => Promise<void>> {
  const ops: Op[] = [];
  const undo: Op[] = [];
  for (const d of items) {
    const where = doseWhere({ medicineId: d.medicine.id, day: d.day, slot: d.slot });
    const before = current.find((c) => c.medicine_id === d.medicine.id && c.day === d.day && c.slot === d.slot);
    ops.push({
      kind: "insert",
      table: "medicine_doses",
      row: { id: before?.id ?? uuidv7(), medicine_id: d.medicine.id, day: d.day, slot: d.slot, status, remind_at: status === "snoozed" ? remindAt?.toISOString() ?? null : null },
      onConflict: "owner_id,medicine_id,day,slot",
      merge: true,
    });
    undo.push(
      before
        ? {
            kind: "insert",
            table: "medicine_doses",
            row: { id: before.id, medicine_id: before.medicine_id, day: before.day, slot: before.slot, status: before.status, remind_at: before.remind_at },
            onConflict: "owner_id,medicine_id,day,slot",
            merge: true,
          }
        : { kind: "delete", table: "medicine_doses", where },
    );
  }
  await commit(ops);
  return () => commit(undo);
}

/** Toglie la risposta: la dose torna senza risposta (dalla sezione Medicine, per correggere). */
export async function clearDose(d: DueDose): Promise<void> {
  await commit([{ kind: "delete", table: "medicine_doses", where: doseWhere({ medicineId: d.medicine.id, day: d.day, slot: d.slot }) }]);
}
