-- Lavatrici collegate al guardaroba (D69).
--
-- 1. Ogni capo ha un gruppo di lavaggio. Vuoto = automatico: l'app lo ricava da colori e materiale
--    (lib/wardrobe/laundry.ts); un valore scelto a mano non viene mai riscritto.
-- 2. Un'attività può essere la lavatrice di un gruppo (`source = 'laundry'`). Completarla apre l'elenco
--    dei capi da lavare di quel gruppo: tornano puliti solo quelli confermati, quindi niente trigger.
-- 3. Ogni lavatrice fatta resta nello storico, con i capi lavati: serve ad annullare e a imparare
--    quanti capi si lavano di solito per gruppo.

alter table public.wardrobe_items
  add column wash_group text check (wash_group in ('dark', 'light', 'colored', 'delicate'));

alter table public.tasks
  add column laundry_group text check (laundry_group in ('dark', 'light', 'colored', 'delicate'));

alter table public.tasks drop constraint tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'recurrence', 'template', 'meal', 'lesson', 'shopping', 'laundry'));

create table public.laundry_loads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Vuoto: una lavatrice senza gruppo (titolo "Lavatrice" senza scuri, chiari…).
  wash_group text check (wash_group in ('dark', 'light', 'colored', 'delicate')),
  washed_on date not null,
  item_ids uuid[] not null default '{}',
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

create index laundry_loads_owner_idx on public.laundry_loads (owner_id, washed_on desc);
create index laundry_loads_task_idx on public.laundry_loads (task_id) where task_id is not null;

alter table public.laundry_loads enable row level security;
create policy laundry_loads_select_own on public.laundry_loads for select to authenticated using (owner_id = (select auth.uid()));
create policy laundry_loads_insert_own on public.laundry_loads for insert to authenticated with check (owner_id = (select auth.uid()));
create policy laundry_loads_update_own on public.laundry_loads for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy laundry_loads_delete_own on public.laundry_loads for delete to authenticated using (owner_id = (select auth.uid()));
