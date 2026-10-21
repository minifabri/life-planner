import { addDays, atLocalTime, type LocalDate } from "../dates/local";
import type { Medicine, MedicineDose, MedicineSlot } from "../supabase/types";
import { SLOTS, doseIndex, doseKey, dueIn, type SlotTimes } from "./schedule";

/**
 * Notifiche delle medicine (D73). Titolo neutro, mai il nome di una medicina: sono dati di salute.
 * - All'orario del momento (mattina, sera), se c'è qualcosa senza risposta.
 * - All'orario di un "ricordamelo", se è ancora aperto. Più "ricordamelo" alla stessa ora fanno una notifica sola,
 *   e nessuna se a quell'ora arriva già quella del momento.
 * La fascia di silenzio la applica chi chiama (`shift`).
 */

export type MedicineReminder = { key: string; fireAt: Date; title: string; body: string };

export const MEDICINE_BODY = "Tocca per segnare cosa hai preso.";
export const SLOT_TITLE: Record<MedicineSlot, string> = { morning: "Promemoria del mattino", evening: "Promemoria della sera" };

export function planMedicineReminders(input: {
  medicines: Pick<Medicine, "id" | "morning" | "evening" | "schedule" | "weekdays" | "cycle_on" | "cycle_off" | "start_date" | "end_date" | "created_at">[];
  doses: Pick<MedicineDose, "medicine_id" | "day" | "slot" | "status" | "remind_at" | "updated_at" | "id">[];
  times: SlotTimes;
  tz: string;
  /** Giorni da guardare, compresi. */
  firstDay: LocalDate;
  lastDay: LocalDate;
  from: Date;
  to: Date;
  /** Sposta un istante fuori dalla fascia di silenzio. */
  shift: (at: Date) => Date;
}): MedicineReminder[] {
  const { times, tz, from, to, shift } = input;
  const medicines = input.medicines as Medicine[];
  const index = doseIndex(input.doses as MedicineDose[]);
  const out: MedicineReminder[] = [];
  const inWindow = (at: Date) => at > from && at <= to;

  for (let day = input.firstDay; day <= input.lastDay; day = addDays(day, 1)) {
    for (const slot of SLOTS) {
      const planned = atLocalTime(day, times[slot], tz);
      const fireAt = shift(planned);
      if (!inWindow(fireAt)) continue;
      // Solo medicine che c'erano già all'orario e ancora senza risposta.
      const open = dueIn(medicines, day, slot).filter(
        (d) => new Date(d.medicine.created_at) <= planned && !index.has(doseKey(d.medicine.id, d.day, d.slot)),
      );
      if (open.length) out.push({ key: `med:${slot}:${day}`, fireAt, title: SLOT_TITLE[slot], body: MEDICINE_BODY });
    }
  }

  const taken = new Set(out.map((r) => r.fireAt.getTime()));
  for (const d of input.doses) {
    if (d.status !== "snoozed" || !d.remind_at) continue;
    const planned = new Date(d.remind_at);
    // Il "ricordamelo" dato dopo l'orario scelto (per esempio da un altro dispositivo) non suona in ritardo.
    if (new Date(d.updated_at) > planned) continue;
    const fireAt = shift(planned);
    if (!inWindow(fireAt) || taken.has(fireAt.getTime())) continue;
    taken.add(fireAt.getTime());
    out.push({ key: `med:snooze:${planned.toISOString()}`, fireAt, title: "Promemoria", body: MEDICINE_BODY });
  }
  return out;
}
