import type { NotificationPrefs } from "../supabase/types";

/** Valori di partenza, gli stessi delle colonne di `profiles`. */
export const DEFAULT_PREFS: NotificationPrefs = {
  morning_overview_time: "07:00",
  quiet_start: "22:00",
  quiet_end: "07:30",
  meal_prep_reminder_time: "20:00",
  notify_medium: true,
  notify_high: true,
  quiet_allow_high: false,
  notify_meal_prep: true,
  notify_morning: false,
  notify_evening: false,
  medicine_morning_time: "08:00",
  medicine_evening_time: "21:00",
  notify_medicines: true,
};
