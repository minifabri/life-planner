-- Medicine e integratori (D73).
--
-- 1. `medicines`: cosa si prende, quando (mattina, sera o entrambe) e con quale ritmo: tutti i giorni,
--    solo certi giorni della settimana (1 = lunedì … 7 = domenica) o a cicli di settimane ("N sì, M no",
--    contati dalla data di inizio). La data di fine è facoltativa.
-- 2. `medicine_doses`: la risposta per un giorno e un momento. Presa, saltata, oppure "ricordamelo"
--    (`snoozed`, con l'istante in cui ricordarla). Nessuna riga = nessuna risposta: l'app non segna nulla da sola.
-- 3. Profilo: orari fissi della mattina e della sera (8:00 e 21:00) e l'interruttore delle notifiche.

create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'medicine' check (kind in ('medicine', 'supplement')),
  morning boolean not null default true,
  evening boolean not null default false,
  schedule text not null default 'daily' check (schedule in ('daily', 'weekdays', 'cycle')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  cycle_on smallint check (cycle_on between 1 and 52),
  cycle_off smallint check (cycle_off between 1 and 52),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (morning or evening),
  check (end_date is null or end_date >= start_date),
  check (schedule <> 'weekdays' or cardinality(weekdays) > 0),
  check (schedule <> 'cycle' or (cycle_on is not null and cycle_off is not null))
);

create index medicines_owner_idx on public.medicines (owner_id);

create table public.medicine_doses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medicine_id uuid not null references public.medicines (id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('morning', 'evening')),
  status text not null check (status in ('taken', 'skipped', 'snoozed')),
  remind_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'snoozed') = (remind_at is not null)),
  unique (owner_id, medicine_id, day, slot)
);

create index medicine_doses_medicine_idx on public.medicine_doses (medicine_id);
create index medicine_doses_owner_day_idx on public.medicine_doses (owner_id, day desc);

create trigger medicines_set_updated_at before update on public.medicines
  for each row execute function public.set_updated_at();
create trigger medicine_doses_set_updated_at before update on public.medicine_doses
  for each row execute function public.set_updated_at();

alter table public.medicines enable row level security;
create policy medicines_select_own on public.medicines for select to authenticated using (owner_id = (select auth.uid()));
create policy medicines_insert_own on public.medicines for insert to authenticated with check (owner_id = (select auth.uid()));
create policy medicines_update_own on public.medicines for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy medicines_delete_own on public.medicines for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.medicine_doses enable row level security;
create policy medicine_doses_select_own on public.medicine_doses for select to authenticated using (owner_id = (select auth.uid()));
create policy medicine_doses_insert_own on public.medicine_doses for insert to authenticated with check (owner_id = (select auth.uid()));
create policy medicine_doses_update_own on public.medicine_doses for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy medicine_doses_delete_own on public.medicine_doses for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.profiles
  add column medicine_morning_time time not null default '08:00',
  add column medicine_evening_time time not null default '21:00',
  add column notify_medicines boolean not null default true;
