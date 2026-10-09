-- Life Planner — schema iniziale (incremento 0)
-- Vedi docs/technical-design.md, sezione 5.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------
-- Funzioni di supporto
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Profilo
-- ---------------------------------------------------------------
create table public.profiles (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Rome',
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  morning_overview_time time not null default '07:00',
  evening_review_time time not null default '20:30',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:30',
  meal_prep_reminder_time time not null default '20:00',
  log_lock_pin_hash text,
  log_lock_webauthn jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Aree di vita
-- ---------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color_dark text not null,
  color_light text not null,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Eventi
-- ---------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  start_date date,
  end_date date,
  tz text not null default 'Europe/Rome',
  rrule text,
  area_id uuid references public.areas (id) on delete set null,
  attention text not null default 'low' check (attention in ('low', 'medium', 'high')),
  source text not null default 'app' check (source in ('app', 'gcal')),
  gcal_calendar_id text,
  gcal_event_id text,
  gcal_etag text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_shape check (
    (all_day = false and start_at is not null)
    or (all_day = true and start_date is not null)
  ),
  constraint events_gcal_unique unique (owner_id, gcal_calendar_id, gcal_event_id)
);

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  original_start timestamptz not null,
  cancelled boolean not null default false,
  new_start_at timestamptz,
  new_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, original_start)
);

-- ---------------------------------------------------------------
-- Ricorrenze delle attività
-- ---------------------------------------------------------------
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('fixed', 'after_completion')),
  rrule text,
  interval_days int check (interval_days is null or interval_days > 0),
  template jsonb not null,
  active boolean not null default true,
  until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrences_shape check (
    (kind = 'fixed' and rrule is not null)
    or (kind = 'after_completion' and interval_days is not null)
  )
);

-- ---------------------------------------------------------------
-- Planner pasti (prima di tasks per la chiave esterna)
-- ---------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  name text not null,
  prep_mode text not null check (prep_mode in ('ready', 'to_prep')),
  prepared boolean not null default false,
  prepared_at timestamptz,
  reminder_task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, date, slot)
);

create table public.meal_memory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  name_normalized text not null,
  display_name text not null,
  default_prep_mode text not null default 'ready' check (default_prep_mode in ('ready', 'to_prep')),
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slot, name_normalized)
);

-- ---------------------------------------------------------------
-- Attività
-- ---------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  date date,
  time time,
  duration_min int check (duration_min is null or duration_min > 0),
  due_date date,
  window_start date,
  attention text not null default 'low' check (attention in ('low', 'medium', 'high')),
  area_id uuid references public.areas (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  completed_at timestamptz,
  original_date date,
  recurrence_id uuid references public.recurrences (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'recurrence', 'template', 'meal')),
  meal_plan_id uuid references public.meal_plans (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_time_needs_date check (time is null or date is not null)
);

alter table public.meal_plans
  add constraint meal_plans_reminder_task_fk
  foreign key (reminder_task_id) references public.tasks (id) on delete set null;

-- ---------------------------------------------------------------
-- Personal Log
-- ---------------------------------------------------------------
create table public.log_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#A3A9B8',
  is_sensitive boolean not null default false,
  track_last boolean not null default true,
  keywords text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.log_categories (id) on delete set null,
  title text not null,
  notes text,
  date date not null,
  time time,
  tags text[] not null default '{}',
  is_sensitive boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Liste: spesa e wishlist
-- ---------------------------------------------------------------
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('shopping', 'wishlist')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null,
  quantity text,
  department text,
  checked boolean not null default false,
  checked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_memory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_normalized text not null,
  display_name text not null,
  department text,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name_normalized)
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null,
  brand text,
  category text,
  url text,
  price_amount numeric(10, 2),
  price_currency text,
  price_is_estimate boolean not null default false,
  image_url text,
  notes text,
  interest smallint not null default 2 check (interest between 1 and 3),
  status text not null default 'wanted' check (status in ('wanted', 'bought', 'discarded')),
  source text not null default 'manual' check (source in ('manual', 'link', 'chatgpt')),
  metadata_fetched_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Template
-- ---------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Notifiche
-- ---------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('event', 'task', 'log_entry', 'meal_plan', 'digest', 'test')),
  target_id uuid,
  fire_at timestamptz not null,
  kind text not null default 'auto' check (kind in ('auto', 'custom')),
  title_snapshot text,
  body_snapshot text,
  url text,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Google Calendar
-- ---------------------------------------------------------------
create table public.gcal_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gcal_calendar_id text not null,
  summary text,
  color text,
  selected boolean not null default false,
  is_write_target boolean not null default false,
  sync_token text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, gcal_calendar_id)
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.google_tokens (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Indici
-- ---------------------------------------------------------------
create index areas_owner_idx on public.areas (owner_id);
create index events_owner_start_idx on public.events (owner_id, start_at) where deleted_at is null;
create index events_owner_date_idx on public.events (owner_id, start_date) where deleted_at is null;
create index events_area_idx on public.events (area_id);
create index event_exceptions_event_idx on public.event_exceptions (event_id);
create index event_exceptions_owner_idx on public.event_exceptions (owner_id);
create index recurrences_owner_idx on public.recurrences (owner_id);
create index meal_plans_owner_date_idx on public.meal_plans (owner_id, date);
create index meal_plans_reminder_task_idx on public.meal_plans (reminder_task_id);
create index meal_memory_owner_slot_idx on public.meal_memory (owner_id, slot);
create index tasks_owner_date_idx on public.tasks (owner_id, date) where deleted_at is null;
create index tasks_owner_window_idx on public.tasks (owner_id, due_date) where deleted_at is null and date is null;
create index tasks_area_idx on public.tasks (area_id);
create index tasks_recurrence_idx on public.tasks (recurrence_id);
create index tasks_meal_plan_idx on public.tasks (meal_plan_id);
create index log_categories_owner_idx on public.log_categories (owner_id);
create index log_entries_owner_date_idx on public.log_entries (owner_id, date desc) where deleted_at is null;
create index log_entries_category_idx on public.log_entries (category_id);
create index lists_owner_idx on public.lists (owner_id);
create index shopping_items_list_idx on public.shopping_items (list_id) where deleted_at is null;
create index shopping_items_owner_idx on public.shopping_items (owner_id);
create index product_memory_owner_idx on public.product_memory (owner_id);
create index wishlist_items_list_idx on public.wishlist_items (list_id) where deleted_at is null;
create index wishlist_items_owner_idx on public.wishlist_items (owner_id);
create index templates_owner_idx on public.templates (owner_id);
create index reminders_due_idx on public.reminders (fire_at) where sent_at is null;
create index reminders_owner_idx on public.reminders (owner_id);
create index push_subscriptions_owner_idx on public.push_subscriptions (owner_id);
create index gcal_calendars_owner_idx on public.gcal_calendars (owner_id);

-- ---------------------------------------------------------------
-- updated_at, RLS e policy per ogni tabella pubblica
-- ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'areas', 'events', 'event_exceptions', 'recurrences',
    'meal_plans', 'meal_memory', 'tasks', 'log_categories', 'log_entries',
    'lists', 'shopping_items', 'product_memory', 'wishlist_items',
    'templates', 'reminders', 'push_subscriptions', 'gcal_calendars'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

create trigger google_tokens_set_updated_at
  before update on private.google_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Nuovo utente: profilo, liste e categorie predefinite del Log
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (owner_id, display_name)
  values (new.id, split_part(new.email, '@', 1));

  insert into public.lists (owner_id, kind, name)
  values (new.id, 'shopping', 'Spesa'), (new.id, 'wishlist', 'Wishlist');

  insert into public.log_categories (owner_id, name, color, is_sensitive, keywords, sort_order)
  values
    (new.id, 'Ciclo', '#E7A2C6', true, array['ciclo'], 1),
    (new.id, 'Trattamenti', '#82A8EC', true, array['trattamento', 'farmaco', 'terapia'], 2),
    (new.id, 'Unghie', '#B9A4FF', false, array['unghie', 'semipermanente'], 3),
    (new.id, 'Parrucchiere', '#D4B47A', false, array['parrucchiere', 'capelli', 'taglio'], 4),
    (new.id, 'Estetica', '#79C7B5', false, array['estetista', 'ceretta'], 5),
    (new.id, 'Personale', '#A3A9B8', false, array[]::text[], 6);

  insert into public.areas (owner_id, name, color_dark, color_light, sort_order)
  values
    (new.id, 'Lavoro', '#82A8EC', '#3F6FC4', 1),
    (new.id, 'Insegnamento yoga', '#B9A4FF', '#6B4FD8', 2),
    (new.id, 'Pratica personale', '#79C7B5', '#2E8C76', 3),
    (new.id, 'Allenamento', '#E9A873', '#B86A2A', 4),
    (new.id, 'Casa', '#A3A9B8', '#6F7687', 5),
    (new.id, 'Cura personale', '#E7A2C6', '#B8508A', 6);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
