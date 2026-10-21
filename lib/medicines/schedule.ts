import { addDays, atLocalTime, diffDays, isoWeekday, localTimeString, shortDate, trimTime, type LocalDate } from "../dates/local";
import { localDateString } from "../dates/today";
import type { Medicine, MedicineDose, MedicineKind, MedicineSlot } from "../supabase/types";

/**
 * Medicine e integratori (D74). Logica pura: quando una medicina va presa, cosa chiedere in Oggi
 * e quali scelte offre "Ricordamelo". Regola D70: senza risposta l'app non segna nulla da sola;
 * la mattina dopo chiede una volta sola di ieri.
 */

export const SLOTS: MedicineSlot[] = ["morning", "evening"];
export const SLOT_LABEL: Record<MedicineSlot, string> = { morning: "Mattina", evening: "Sera" };
export const KIND_LABEL: Record<MedicineKind, string> = { medicine: "Medicina", supplement: "Integratore" };
/** Nomi brevi dei giorni, da lunedì (1) a domenica (7). */
export const WEEKDAY_SHORT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

/** Orari fissi della mattina e della sera ("HH:mm" o "HH:mm:ss"). */
export type SlotTimes = { morning: string; evening: string };

export function slotTimes(p: { medicine_morning_time?: string | null; medicine_evening_time?: string | null } | null | undefined): SlotTimes {
  return { morning: trimTime(p?.medicine_morning_time ?? "08:00"), evening: trimTime(p?.medicine_evening_time ?? "21:00") };
}

type Schedulable = Pick<Medicine, "morning" | "evening" | "schedule" | "weekdays" | "cycle_on" | "cycle_off" | "start_date" | "end_date">;

export function slotsOf(m: Pick<Medicine, "morning" | "evening">): MedicineSlot[] {
  return SLOTS.filter((s) => m[s]);
}

/** Vero se la medicina va presa in quel giorno (in almeno un momento). */
export function isDueOn(m: Schedulable, day: LocalDate): boolean {
  if (day < m.start_date || (m.end_date && day > m.end_date)) return false;
  if (m.schedule === "weekdays") return m.weekdays.includes(isoWeekday(day));
  if (m.schedule === "cycle") {
    const on = m.cycle_on ?? 1;
    const off = m.cycle_off ?? 0;
    // Le settimane si contano dalla data di inizio, che apre sempre una settimana "sì".
    const week = Math.floor(diffDays(day, m.start_date) / 7);
    return week % (on + off) < on;
  }
  return true;
}

export type DueDose = { medicine: Medicine; day: LocalDate; slot: MedicineSlot };

/** Le dosi previste in un giorno e in un momento, nell'ordine dell'elenco. */
export function dueIn(medicines: Medicine[], day: LocalDate, slot: MedicineSlot): DueDose[] {
  return medicines.filter((m) => m[slot] && isDueOn(m, day)).map((medicine) => ({ medicine, day, slot }));
}

export const doseKey = (medicineId: string, day: LocalDate, slot: MedicineSlot) => `${medicineId}:${day}:${slot}`;

export function doseIndex(doses: MedicineDose[]): Map<string, MedicineDose> {
  return new Map(doses.map((d) => [doseKey(d.medicine_id, d.day, d.slot), d]));
}

export type SlotGroup = { day: LocalDate; slot: MedicineSlot; items: DueDose[] };

export type TodayMedicines = {
  /** Oggi, momenti già arrivati: da segnare (comprese quelle il cui "ricordamelo" è scaduto). */
  now: SlotGroup[];
  /** Ieri senza risposta (o con un "ricordamelo" scaduto): una domanda sola, Sì o No. */
  yesterday: SlotGroup[];
  /** "Ricordamelo" non ancora scaduto, per una riga discreta "Te lo ricordo alle…". */
  waiting: (DueDose & { remindAt: Date })[];
};

/**
 * Cosa mostrare in Oggi. Un momento compare dal suo orario; prima di allora si segna dalla sezione Medicine.
 * Di ieri si chiede solo per le medicine che l'app conosceva già ieri.
 */
export function todayMedicines(input: {
  medicines: Medicine[];
  doses: MedicineDose[];
  today: LocalDate;
  now: Date;
  tz: string;
  times: SlotTimes;
}): TodayMedicines {
  const { medicines, today, now, tz, times } = input;
  const index = doseIndex(input.doses);
  const nowTime = localTimeString(now, tz);
  const yesterday = addDays(today, -1);
  const out: TodayMedicines = { now: [], yesterday: [], waiting: [] };

  /** Senza risposta, o con un "ricordamelo" già scaduto: da chiedere. Un "ricordamelo" futuro va in `waiting`. */
  const open = (d: DueDose): boolean => {
    const dose = index.get(doseKey(d.medicine.id, d.day, d.slot));
    if (!dose) return true;
    if (dose.status !== "snoozed" || !dose.remind_at) return false;
    const at = new Date(dose.remind_at);
    if (at <= now) return true;
    out.waiting.push({ ...d, remindAt: at });
    return false;
  };

  for (const slot of SLOTS) {
    const known = medicines.filter((m) => localDateString(new Date(m.created_at), tz) <= yesterday);
    const items = dueIn(known, yesterday, slot).filter(open);
    if (items.length) out.yesterday.push({ day: yesterday, slot, items });
  }
  for (const slot of SLOTS) {
    const all = dueIn(medicines, today, slot);
    // Prima dell'orario il momento non chiede, ma un "ricordamelo" già dato resta visibile.
    if (nowTime < times[slot]) {
      for (const d of all) {
        const dose = index.get(doseKey(d.medicine.id, d.day, d.slot));
        if (dose?.status === "snoozed" && dose.remind_at && new Date(dose.remind_at) > now) out.waiting.push({ ...d, remindAt: new Date(dose.remind_at) });
      }
      continue;
    }
    const items = all.filter(open);
    if (items.length) out.now.push({ day: today, slot, items });
  }
  out.waiting.sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  return out;
}

export type SnoozeOption = { label: string; at: Date };

/**
 * Le scelte di "Ricordamelo": tra 1 ora, tra 3 ore, e stasera (al mattino) o domattina (la sera).
 * "Stasera" non c'è se l'orario della sera è già vicino o passato.
 */
export function snoozeOptions(slot: MedicineSlot, now: Date, today: LocalDate, tz: string, times: SlotTimes): SnoozeOption[] {
  const hour = 3_600_000;
  const options: SnoozeOption[] = [
    { label: "Tra 1 ora", at: new Date(now.getTime() + hour) },
    { label: "Tra 3 ore", at: new Date(now.getTime() + 3 * hour) },
  ];
  if (slot === "morning") {
    const evening = atLocalTime(today, times.evening, tz);
    if (evening.getTime() > now.getTime() + 3 * hour) options.push({ label: `Stasera alle ${times.evening}`, at: evening });
  } else {
    options.push({ label: `Domattina alle ${times.morning}`, at: atLocalTime(addDays(today, 1), times.morning, tz) });
  }
  return options;
}

/** "Ieri sera", "Ieri mattina", "Stamattina", "Stasera". */
export function slotPhrase(slot: MedicineSlot, day: LocalDate, today: LocalDate): string {
  if (day === today) return slot === "morning" ? "Stamattina" : "Stasera";
  if (day === addDays(today, -1)) return slot === "morning" ? "Ieri mattina" : "Ieri sera";
  return `${shortDate(day)}, ${SLOT_LABEL[slot].toLowerCase()}`;
}

/** Elenco leggibile: "A", "A e B", "A, B e C". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Riassunto del ritmo: "Mattina e sera · tutti i giorni · dal 3 ott al 30 nov". */
export function scheduleSummary(m: Schedulable, today: LocalDate): string {
  const when = m.morning && m.evening ? "Mattina e sera" : m.morning ? "Mattina" : "Sera";
  const rhythm =
    m.schedule === "weekdays"
      ? [...m.weekdays].sort().map((d) => WEEKDAY_SHORT[d - 1]).join(", ")
      : m.schedule === "cycle"
        ? `${weeks(m.cycle_on ?? 1)} sì, ${weeks(m.cycle_off ?? 1)} no`
        : "tutti i giorni";
  const from = m.start_date > today ? `dal ${shortDate(m.start_date)}` : null;
  const to = m.end_date ? `fino al ${shortDate(m.end_date)}` : null;
  return [when, rhythm, [from, to].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

const weeks = (n: number) => (n === 1 ? "1 settimana" : `${n} settimane`);

export type MedicinePhase = "active" | "upcoming" | "ended";

/** In corso, non ancora iniziata o finita (dopo la data di fine). */
export function phaseOf(m: Pick<Medicine, "start_date" | "end_date">, today: LocalDate): MedicinePhase {
  if (m.end_date && m.end_date < today) return "ended";
  return m.start_date > today ? "upcoming" : "active";
}

/** Nei giorni di pausa di un ciclo: la prossima data in cui si riprende, entro un anno. */
export function nextDueDay(m: Schedulable, today: LocalDate): LocalDate | null {
  for (let i = 0; i <= 366; i++) {
    const day = addDays(today, i);
    if (m.end_date && day > m.end_date) return null;
    if (isDueOn(m, day)) return day;
  }
  return null;
}

export type HistoryState = "taken" | "skipped" | "none";
export type HistoryDay = { day: LocalDate; slots: { slot: MedicineSlot; state: HistoryState }[] };

/**
 * Storico giorno per giorno di una medicina, dal più recente: presa, saltata o senza risposta.
 * Solo i giorni in cui andava presa e fino a ieri (oggi, se già risposto). Un "ricordamelo" mai chiuso è senza risposta.
 */
export function history(m: Medicine, doses: MedicineDose[], today: LocalDate, days = 30): HistoryDay[] {
  const index = doseIndex(doses.filter((d) => d.medicine_id === m.id));
  const out: HistoryDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (day < m.start_date) break;
    if (!isDueOn(m, day)) continue;
    const slots = slotsOf(m).map((slot) => {
      const status = index.get(doseKey(m.id, day, slot))?.status;
      return { slot, state: (status === "taken" || status === "skipped" ? status : "none") as HistoryState };
    });
    if (day === today && slots.every((s) => s.state === "none")) continue;
    out.push({ day, slots });
  }
  return out;
}

export type MedicineDraft = Pick<Medicine, "name" | "kind" | "morning" | "evening" | "schedule" | "weekdays" | "cycle_on" | "cycle_off" | "start_date" | "end_date">;

/** Cosa manca perché la scheda si possa salvare, in una frase; null se va bene. */
export function draftProblem(d: MedicineDraft): string | null {
  if (!d.name.trim()) return "Scrivi il nome.";
  if (!d.morning && !d.evening) return "Scegli mattina, sera o tutte e due.";
  if (d.schedule === "weekdays" && d.weekdays.length === 0) return "Scegli almeno un giorno.";
  if (d.schedule === "cycle" && (!d.cycle_on || !d.cycle_off)) return "Indica le settimane sì e le settimane no.";
  if (!d.start_date) return "Indica la data di inizio.";
  if (d.end_date && d.end_date < d.start_date) return "La fine viene prima dell'inizio.";
  return null;
}

/** Tiene solo i campi del ritmo scelto, così un ritmo cambiato non lascia valori vecchi. */
export function cleanDraft(d: MedicineDraft): MedicineDraft {
  return {
    ...d,
    name: d.name.trim(),
    weekdays: d.schedule === "weekdays" ? [...new Set(d.weekdays)].sort() : [],
    cycle_on: d.schedule === "cycle" ? d.cycle_on : null,
    cycle_off: d.schedule === "cycle" ? d.cycle_off : null,
    end_date: d.end_date || null,
  };
}
