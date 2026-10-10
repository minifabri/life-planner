-- Calendario iCloud in sola lettura via CalDAV (incremento 1d).
-- Vedi docs/technical-design.md, sezione 9.6.

-- ---------------------------------------------------------------
-- Account e calendari
-- ---------------------------------------------------------------
create table public.icloud_accounts (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  apple_id text not null,
  home_url text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.icloud_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  name text not null,
  color text,
  selected boolean not null default false,
  ctag text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, url)
);

-- ---------------------------------------------------------------
-- Eventi: provenienza iCloud
-- ---------------------------------------------------------------
alter table public.events drop constraint events_source_check;
alter table public.events add constraint events_source_check check (source in ('app', 'gcal', 'icloud'));

alter table public.events
  add column icloud_calendar_id uuid references public.icloud_calendars (id) on delete cascade,
  add column icloud_href text,
  add column icloud_etag text;

create index events_icloud_calendar_idx on public.events (icloud_calendar_id, icloud_href);

-- ---------------------------------------------------------------
-- updated_at, RLS e policy
-- ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['icloud_accounts', 'icloud_calendars']
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

-- ---------------------------------------------------------------
-- Credenziali in Vault, lette e scritte solo dalla Edge Function (service role)
-- ---------------------------------------------------------------
create or replace function public.icloud_set_credentials(p_owner uuid, p_apple_id text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'icloud:' || p_owner::text;
  v_secret text := jsonb_build_object('apple_id', p_apple_id, 'password', p_password)::text;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_secret, v_name, 'Credenziali CalDAV iCloud');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;

create or replace function public.icloud_get_credentials(p_owner uuid)
returns table (apple_id text, password text)
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret::jsonb ->> 'apple_id', s.decrypted_secret::jsonb ->> 'password'
  from vault.decrypted_secrets s
  where s.name = 'icloud:' || p_owner::text;
$$;

create or replace function public.icloud_delete_credentials(p_owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'icloud:' || p_owner::text;
$$;

revoke execute on function public.icloud_set_credentials(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.icloud_get_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.icloud_delete_credentials(uuid) from public, anon, authenticated;
grant execute on function public.icloud_set_credentials(uuid, text, text) to service_role;
grant execute on function public.icloud_get_credentials(uuid) to service_role;
grant execute on function public.icloud_delete_credentials(uuid) to service_role;
