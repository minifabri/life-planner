-- Incremento 29 — Tipi di evento (spedizione, compleanno) e Google Calendar dall'indirizzo segreto iCal.
-- Vedi docs/technical-design.md, sezioni 9.1 e 9.1b.

-- ---------------------------------------------------------------
-- Eventi: tipo. Spedizioni e compleanni si mostrano in modo discreto.
-- ---------------------------------------------------------------
alter table public.events
  add column kind text not null default 'event' check (kind in ('event', 'shipment', 'birthday'));

-- ---------------------------------------------------------------
-- Calendari Google letti dall'indirizzo segreto in formato iCal (sola lettura).
-- La tabella esiste dallo schema iniziale (con RLS e le quattro policy); servono solo l'errore e l'indice degli eventi.
-- ---------------------------------------------------------------
alter table public.gcal_calendars add column last_error text;

create index events_gcal_calendar_idx on public.events (owner_id, gcal_calendar_id) where gcal_calendar_id is not null;

-- ---------------------------------------------------------------
-- L'indirizzo segreto vale come una password: sta in Vault, letto e scritto solo dalla Edge Function (service role).
-- ---------------------------------------------------------------
create or replace function public.gcal_set_feed(p_owner uuid, p_calendar uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'gcal:' || p_owner::text || ':' || p_calendar::text;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_url, v_name, 'Indirizzo segreto iCal di Google Calendar');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
end;
$$;

create or replace function public.gcal_get_feed(p_owner uuid, p_calendar uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = 'gcal:' || p_owner::text || ':' || p_calendar::text;
$$;

create or replace function public.gcal_delete_feed(p_owner uuid, p_calendar uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'gcal:' || p_owner::text || ':' || p_calendar::text;
$$;

revoke execute on function public.gcal_set_feed(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.gcal_get_feed(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.gcal_delete_feed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gcal_set_feed(uuid, uuid, text) to service_role;
grant execute on function public.gcal_get_feed(uuid, uuid) to service_role;
grant execute on function public.gcal_delete_feed(uuid, uuid) to service_role;

-- Eliminazione dell'account: anche gli indirizzi di Google.
create or replace function public.delete_account_secrets(p_owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets
  where name in ('icloud:' || p_owner::text, 'imayoga:' || p_owner::text)
     or name like 'gcal:' || p_owner::text || ':%';
$$;

revoke execute on function public.delete_account_secrets(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_secrets(uuid) to service_role;
