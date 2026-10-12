/** Righe delle tabelle usate dal client (vedi supabase/migrations). */

import type { LessonDetails } from "../imayoga/map";

export type Attention = "low" | "medium" | "high";
export type TaskStatus = "open" | "done" | "dismissed";

export type Profile = {
  owner_id: string;
  display_name: string | null;
  timezone: string;
  theme: "dark" | "light";
  evening_review_time: string;
} & NotificationPrefs;

/** Preferenze delle notifiche (technical-design.md, 7.2). Gli orari sono "HH:mm:ss". */
export type NotificationPrefs = {
  morning_overview_time: string;
  quiet_start: string;
  quiet_end: string;
  meal_prep_reminder_time: string;
  notify_medium: boolean;
  notify_high: boolean;
  /** Le notifiche di attenzione alta arrivano anche nella fascia di silenzio. */
  quiet_allow_high: boolean;
  notify_meal_prep: boolean;
  notify_morning: boolean;
  notify_evening: boolean;
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
  source: "manual" | "recurrence" | "template" | "meal" | "lesson";
  meal_plan_id: string | null;
  /** Lezione di imayoga da preparare (`source = 'lesson'`). */
  event_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DayMarkKind = "office" | "travel";

/** Segno di un giorno: "in ufficio", "in viaggio". Un giorno può averne più di uno. */
export type DayMark = {
  id: string;
  date: string;
  kind: DayMarkKind;
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
  /** Posti e prenotati di una lezione di imayoga. */
  lesson: LessonDetails | null;
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
  /** Finito: l'articolo comprato non è più in casa (Pasti → In casa). */
  finished_at: string | null;
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

/** Collegamento con Salute di Apple: esiste finché il token personale è valido. */
export type HealthLink = {
  owner_id: string;
  created_at: string;
  last_received_at: string | null;
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

export type WardrobeCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "bag" | "other";
export type WardrobeStatus = "clean" | "worn" | "to_wash";

export type WardrobeItem = {
  id: string;
  name: string | null;
  image_path: string | null;
  thumb_path: string | null;
  /** Immagine esterna (es. da un articolo della wishlist), finché non c'è una foto propria. */
  image_url: string | null;
  category: WardrobeCategory;
  subcategory: string | null;
  colors: string[];
  seasons: string[];
  styles: string[];
  occasions: string[];
  material: string | null;
  brand: string | null;
  /** Leggerezza (1) → pesantezza (5): indicativo, non un vincolo rigido. */
  warmth: 1 | 2 | 3 | 4 | 5 | null;
  layerable: boolean;
  status: WardrobeStatus;
  favorite: boolean;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Outfit = {
  id: string;
  name: string | null;
  /** Id dei capi (`wardrobe_items`): riferimenti, mai copie delle immagini. */
  item_ids: string[];
  styles: string[];
  occasions: string[];
  seasons: string[];
  favorite: boolean;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Un utilizzo effettivo (non una pianificazione): i capi indossati in un giorno. */
export type WardrobeWear = {
  id: string;
  worn_on: string;
  outfit_id: string | null;
  item_ids: string[];
  created_at: string;
};

/** Outfit pianificato per un giorno (non un utilizzo, non un evento del calendario). */
export type OutfitPlan = {
  id: string;
  date: string;
  event_id: string | null;
  /** Titolo dell'evento al momento della scelta, oppure un'occasione scritta a mano. */
  label: string | null;
  outfit_id: string | null;
  /** I capi fissati al momento della pianificazione: valgono se l'outfit salvato non c'è (più). */
  item_ids: string[];
  created_at: string;
};

/** Giudizio esplicito su una combinazione di capi (non si deduce mai da ciò che non viene scelto). */
export type OutfitFeedback = {
  id: string;
  item_ids: string[];
  /** Gli id ordinati e uniti da "|": la stessa combinazione ha sempre la stessa firma. */
  signature: string;
  verdict: "like" | "dislike";
  created_at: string;
};

/** Profilo di stile usato dai suggerimenti: orientamenti, non divieti. */
export type WardrobeStyle = {
  liked_styles: string[];
  liked_colors: string[];
  /** Parole cercate in nome, sottocategoria, materiale e note dei capi (es. "con lacci"). */
  avoid: string[];
  /** Pesi dei fattori del motore, se diversi da quelli predefiniti. */
  weights: Partial<Record<string, number>> | null;
};

/** Una voce di un template: il giorno è la distanza dalla data di partenza. */
export type TemplateItem = {
  title: string;
  day_offset: number;
  /** "HH:mm", se l'attività ha un orario. */
  time: string | null;
  duration_min: number | null;
  area_id: string | null;
  attention: Attention;
};

export type Template = {
  id: string;
  name: string;
  items: TemplateItem[];
};
