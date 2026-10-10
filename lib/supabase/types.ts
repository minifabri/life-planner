/** Righe delle tabelle usate dal client (vedi supabase/migrations). */

export type Attention = "low" | "medium" | "high";
export type TaskStatus = "open" | "done" | "dismissed";

export type Profile = {
  owner_id: string;
  display_name: string | null;
  timezone: string;
  theme: "dark" | "light";
  evening_review_time: string;
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

export type WorkoutStatus = "planned" | "done" | "skipped";

/** Allenamento: si pianifica e si completa, ma se salta non resta indietro. */
export type Workout = {
  id: string;
  /** Disciplina, testo libero: "Corsa", "Forza". */
  activity: string;
  date: string;
  time: string | null;
  duration_min: number | null;
  notes: string | null;
  status: WorkoutStatus;
  completed_at: string | null;
  distance_m: number | null;
  energy_kcal: number | null;
  avg_hr: number | null;
  source: "app" | "health";
  /** Identificativo dell'allenamento in Salute di Apple: evita i duplicati. */
  health_id: string | null;
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
  source: "app" | "gcal" | "icloud" | "imayoga";
  icloud_calendar_id: string | null;
  icloud_href: string | null;
  icloud_etag: string | null;
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

export type ShoppingItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  department: string | null;
  checked: boolean;
  checked_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ProductMemory = {
  id: string;
  display_name: string;
  department: string | null;
  use_count: number;
  last_used_at: string | null;
};

export type IcloudAccount = {
  owner_id: string;
  apple_id: string;
  home_url: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type ImayogaAccount = {
  owner_id: string;
  last_synced_at: string | null;
  last_error: string | null;
};

export type IcloudCalendar = {
  id: string;
  url: string;
  name: string;
  color: string | null;
  selected: boolean;
  ctag: string | null;
  last_synced_at: string | null;
};

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
export type PrepMode = "ready" | "to_prep";

export type MealPlan = {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  prep_mode: PrepMode;
  prepared: boolean;
  prepared_at: string | null;
  /** Attività "Preparare … di domani" collegata, se esiste ancora. */
  reminder_task_id: string | null;
};

/** Un pasto ricorrente imparato dall'uso, per i suggerimenti. */
export type MealMemory = {
  id: string;
  slot: MealSlot;
  name_normalized: string;
  display_name: string;
  default_prep_mode: PrepMode;
  use_count: number;
  last_used_at: string | null;
};

export type LogEntry = {
  id: string;
  category_id: string | null;
  title: string;
  notes: string | null;
  date: string;
  time: string | null;
  tags: string[];
  is_sensitive: boolean;
  deleted_at: string | null;
  created_at: string;
};

/** Ciò che si vede di una registrazione riservata a Log bloccato: solo che esiste, e in che giorno. */
export type LogStub = { id: string; date: string };

export type WishlistStatus = "wanted" | "bought" | "discarded";

export type WishlistItem = {
  id: string;
  list_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  price_is_estimate: boolean;
  image_url: string | null;
  notes: string | null;
  interest: 1 | 2 | 3;
  status: WishlistStatus;
  source: "manual" | "link" | "chatgpt";
  metadata_fetched_at: string | null;
  deleted_at: string | null;
  created_at: string;
};
