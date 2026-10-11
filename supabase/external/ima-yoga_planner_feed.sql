-- Copia di riferimento della migrazione applicata al progetto Supabase `ima-yoga`
-- (id fmlndlnpooyrvnzhmota) il 10 ottobre 2026, aggiornata l'11 ottobre 2026 con posti,
-- nomi dei prenotati, lista d'attesa e allieva assegnata. NON è una migrazione del planner.
-- Vedi docs/technical-design.md, sezione 9.2.
--
-- Espone al Personal Life Planner, in sola lettura, le lezioni e gli eventi pubblicati.
-- Delle persone esce solo il nome: niente telefono, note o pagamenti.
-- L'accesso richiede un token: qui se ne conserva solo l'impronta SHA-256.

create table if not exists public.planner_feed_tokens (
  token_hash text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

alter table public.planner_feed_tokens enable row level security;

drop policy if exists planner_feed_tokens_admin_only on public.planner_feed_tokens;
create policy planner_feed_tokens_admin_only on public.planner_feed_tokens
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Il tipo restituito è cambiato: la funzione va tolta e ricreata.
drop function if exists public.planner_feed(text, date, date);

create function public.planner_feed(p_token text, p_from date, p_to date)
returns table (
  kind text,
  id uuid,
  starts_on date,
  starts_at time,
  title text,
  level_name text,
  location text,
  is_individual boolean,
  booked_count bigint,
  assigned boolean,
  capacity integer,
  booked jsonb,
  waitlist jsonb,
  assigned_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Un token sbagliato è un errore, non un elenco vuoto: il planner non deve scambiarlo per "nessuna lezione".
  if not exists (
    select 1 from public.planner_feed_tokens t
    where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  ) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;

  return query
    select 'class'::text, c.id, c.class_date, c.class_time, ct.name, l.name, null::text, c.is_individual,
      (select count(*) from public.bookings b where b.class_id = c.id and b.status = 'booked'),
      c.personal_client_id is not null,
      c.capacity,
      coalesce((
        select jsonb_agg(p.full_name order by b.created_at)
        from public.bookings b join public.profiles p on p.id = b.client_id
        where b.class_id = c.id and b.status = 'booked'
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p.full_name order by b.created_at)
        from public.bookings b join public.profiles p on p.id = b.client_id
        where b.class_id = c.id and b.status = 'waitlist'
      ), '[]'::jsonb),
      pc.full_name
    from public.classes c
    left join public.class_types ct on ct.id = c.type_id
    left join public.levels l on l.id = c.level_id
    left join public.profiles pc on pc.id = c.personal_client_id
    where c.published and c.class_date between p_from and p_to
    union all
    select 'event'::text, e.id, e.event_date, e.event_time, e.name, null::text, e.location, false, 0::bigint, false,
      null::integer, null::jsonb, null::jsonb, null::text
    from public.events e
    where e.published and not e.archived and e.event_date between p_from and p_to
    order by 3, 4;
end;
$$;

revoke execute on function public.planner_feed(text, date, date) from public;
-- La chiama solo la Edge Function del planner, con la chiave pubblica: basta il ruolo anon.
revoke execute on function public.planner_feed(text, date, date) from authenticated;
grant execute on function public.planner_feed(text, date, date) to anon, service_role;
