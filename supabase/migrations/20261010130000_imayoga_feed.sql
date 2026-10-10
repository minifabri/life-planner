-- Lezioni da imayoga in sola lettura (incremento 1e).
-- Vedi docs/technical-design.md, sezione 9.2.

-- ---------------------------------------------------------------
-- Collegamento: una riga per chi segue le lezioni di imayoga
-- ---------------------------------------------------------------
create table public.imayoga_accounts (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger imayoga_accounts_set_updated_at before update on public.imayoga_accounts
  for each row execute function public.set_updated_at();

alter table public.imayoga_accounts enable row level security;

create policy imayoga_accounts_select_own on public.imayoga_accounts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy imayoga_accounts_insert_own on public.imayoga_accounts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy imayoga_accounts_update_own on public.imayoga_accounts
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy imayoga_accounts_delete_own on public.imayoga_accounts
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- Eventi: provenienza imayoga. L'id dell'evento deriva da quello della lezione.
-- ---------------------------------------------------------------
alter table public.events drop constraint events_source_check;
alter table public.events add constraint events_source_check check (source in ('app', 'gcal', 'icloud', 'imayoga'));

create index events_imayoga_idx on public.events (owner_id) where source = 'imayoga';

-- ---------------------------------------------------------------
-- Indirizzo, chiave pubblica e token del feed in Vault (segreto `imayoga:<owner_id>`),
-- letti solo dalla Edge Function (service role)
-- ---------------------------------------------------------------
create or replace function public.imayoga_get_feed_config(p_owner uuid)
returns table (url text, api_key text, token text)
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret::jsonb ->> 'url', s.decrypted_secret::jsonb ->> 'api_key', s.decrypted_secret::jsonb ->> 'token'
  from vault.decrypted_secrets s
  where s.name = 'imayoga:' || p_owner::text;
$$;

revoke execute on function public.imayoga_get_feed_config(uuid) from public, anon, authenticated;
grant execute on function public.imayoga_get_feed_config(uuid) to service_role;
