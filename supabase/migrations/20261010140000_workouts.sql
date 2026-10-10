-- Incremento 7b — Allenamenti: un tipo a sé, accanto ad attività ed eventi.
-- Si pianificano e si completano; `source = 'health'` e `health_id` servono al collegamento con Salute di Apple.

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity text not null,
  date date not null,
  time time,
  duration_min int check (duration_min > 0),
  notes text,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  completed_at timestamptz,
  distance_m int check (distance_m > 0),
  energy_kcal int check (energy_kcal > 0),
  avg_hr int check (avg_hr > 0),
  source text not null default 'app' check (source in ('app', 'health')),
  health_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, health_id)
);

create index workouts_owner_date_idx on public.workouts (owner_id, date);

create trigger workouts_set_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();

alter table public.workouts enable row level security;
create policy workouts_select_own on public.workouts for select to authenticated using (owner_id = (select auth.uid()));
create policy workouts_insert_own on public.workouts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy workouts_update_own on public.workouts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy workouts_delete_own on public.workouts for delete to authenticated using (owner_id = (select auth.uid()));

-- L'area di vita "Allenamento" non è più tra le predefinite: gli allenamenti hanno il loro tipo.
-- Le aree già create restano, con le attività e gli eventi che le usano.
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
    (new.id, 'Casa', '#A3A9B8', '#6F7687', 4),
    (new.id, 'Cura personale', '#E7A2C6', '#B8508A', 5);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
