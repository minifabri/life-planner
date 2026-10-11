-- Segni dei giorni (D46): "in ufficio", "in viaggio". Un giorno può averne più di uno.
-- Si aggiungono e si tolgono con un tocco: nessuna eliminazione reversibile, la riga sparisce.

create table public.day_marks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('office', 'travel')),
  created_at timestamptz not null default now(),
  unique (owner_id, date, kind)
);

alter table public.day_marks enable row level security;
create policy day_marks_select_own on public.day_marks for select to authenticated using (owner_id = (select auth.uid()));
create policy day_marks_insert_own on public.day_marks for insert to authenticated with check (owner_id = (select auth.uid()));
create policy day_marks_update_own on public.day_marks for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy day_marks_delete_own on public.day_marks for delete to authenticated using (owner_id = (select auth.uid()));
