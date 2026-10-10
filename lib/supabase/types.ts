/** Righe delle tabelle usate dal client (vedi supabase/migrations). */

export type Attention = "low" | "medium" | "high";
export type TaskStatus = "open" | "done" | "dismissed";

export type Profile = {
  owner_id: string;
  display_name: string | null;
  timezone: string;
  theme: "dark" | "light";
};

export type Area = {
  id: string;
  name: string;
  color_dark: string;
  color_light: string;
  sort_order: number;
  archived_at: string | null;
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  date: string | null;
  time: string | null;
  duration_min: number | null;
  due_date: string | null;
  window_start: string | null;
  attention: Attention;
  area_id: string | null;
  status: TaskStatus;
  completed_at: string | null;
  original_date: string | null;
  recurrence_id: string | null;
  source: "manual" | "recurrence" | "template" | "meal";
  meal_plan_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  tz: string;
  rrule: string | null;
  area_id: string | null;
  attention: Attention;
  source: "app" | "gcal";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventException = {
  id: string;
  event_id: string;
  original_start: string;
  cancelled: boolean;
  new_start_at: string | null;
  new_end_at: string | null;
};

/** Dati dell'attività da generare a ogni occorrenza. */
export type RecurrenceTemplate = {
  title: string;
  notes: string | null;
  time: string | null;
  duration_min: number | null;
  area_id: string | null;
  attention: Attention;
  /** Data della prima attività: le occorrenze generate partono dal giorno dopo. */
  start_date: string;
};

export type Recurrence = {
  id: string;
  kind: "fixed" | "after_completion";
  rrule: string | null;
  interval_days: number | null;
  template: RecurrenceTemplate;
  active: boolean;
  until: string | null;
};

export type LogCategory = {
  id: string;
  name: string;
  color: string;
  is_sensitive: boolean;
  track_last: boolean;
  keywords: string[];
  sort_order: number;
};

export type List = {
  id: string;
  kind: "shopping" | "wishlist";
  name: string;
};
