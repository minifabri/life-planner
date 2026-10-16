-- Attività ed eventi riservati (D68).

-- Un'attività o un evento riservato si vede solo a Log sbloccato: a Log bloccato il client ne chiede
-- solo giorno e orario e mostra un titolo neutro. Il contenuto non entra nella cache del dispositivo
-- né nella outbox (technical-design.md, incremento 34). Solo gli eventi nati nell'app possono esserlo.
alter table public.tasks
  add column is_private boolean not null default false;

alter table public.events
  add column is_private boolean not null default false,
  add constraint events_private_app_only check (not is_private or source = 'app');

-- Ricerca: attività ed eventi riservati compaiono solo a Log sbloccato, come le registrazioni riservate.
-- Il resto della funzione è quello di 20261016100000_meal_condiments.sql.
create or replace function public.search_all(
  q text,
  types text[] default null,
  from_date date default null,
  to_date date default null,
  include_sensitive boolean default false,
  max_results int default 40
)
returns table (kind text, id uuid, title text, detail text, date date, "time" time, done boolean, score real)
language sql
stable
set search_path = ''
as $$
  with needle as (
    select n.nq, replace(n.nq, ' ', '') as packed,
           '%' || replace(replace(replace(n.nq, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from (select btrim(regexp_replace(public.search_text(coalesce(q, '')), '\s+', ' ', 'g')) as nq) n
  ),
  items as (
    select 'task'::text as kind, t.id, t.title, null::text as detail, coalesce(t.date, t.due_date) as date, t.time,
           t.status = 'done' as done, public.search_text(t.title, t.notes) as search_text
    from public.tasks t
    where t.deleted_at is null and t.status in ('open', 'done') and (include_sensitive or not t.is_private)
    union all
    select 'event', e.id, e.title, coalesce(nullif(e.location, ''), case when e.rrule is not null then 'si ripete' end),
           coalesce(e.start_date, (e.start_at at time zone e.tz)::date),
           case when e.all_day then null else (e.start_at at time zone e.tz)::time end, false, public.search_text(e.title, e.notes, e.location) as search_text
    from public.events e
    where e.deleted_at is null and (include_sensitive or not e.is_private)
    union all
    select 'log', l.id, l.title, c.name, l.date, l.time, false, public.search_text(l.title, l.notes, public.search_tags(l.tags)) as search_text
    from public.log_entries l
    left join public.log_categories c on c.id = l.category_id
    where l.deleted_at is null and (include_sensitive or not l.is_sensitive)
    union all
    select 'shopping', s.id, s.name, s.quantity, null, null, s.checked, public.search_text(s.name) as search_text
    from public.shopping_items s
    where s.deleted_at is null
    union all
    select 'wishlist', w.id, w.name, w.brand, null, null, w.status = 'bought', public.search_text(w.name, w.brand, w.category, w.notes) as search_text
    from public.wishlist_items w
    where w.deleted_at is null and w.status <> 'discarded'
    union all
    select 'meal', m.id, coalesce(nullif(m.name, ''), 'Mangiato fuori'),
           case m.slot when 'breakfast' then 'colazione' when 'lunch' then 'pranzo' when 'snack' then 'merenda' when 'dinner' then 'cena' else 'extra' end,
           m.date, null, false, public.search_text(m.name, m.condiments) as search_text
    from public.meal_plans m
    union all
    select 'workout', k.id, k.activity, null, k.date, k.time, k.status = 'done', public.search_text(k.activity, k.notes) as search_text
    from public.workouts k
    where k.deleted_at is null and k.status <> 'skipped'
  ),
  scored as (
    select i.*,
           case
             when n.nq = '' then 0
             -- Il testo c'è, anche scritto con spazi in più o in meno ("lent icchie").
             when i.search_text like n.pattern or replace(i.search_text, ' ', '') like '%' || replace(replace(replace(n.packed, '\', '\\'), '%', '\%'), '_', '\_') || '%'
               then 1 + extensions.similarity(n.nq, i.search_text)
             -- Altrimenti somiglianza con una parte del testo: tollera gli errori di battitura.
             else greatest(extensions.word_similarity(n.nq, i.search_text), extensions.word_similarity(n.packed, i.search_text))
           end::real as score,
           n.nq
    from items i cross join needle n
    where (types is null or i.kind = any (types))
      and (from_date is null or i.date >= from_date)
      and (to_date is null or i.date <= to_date)
  )
  select s.kind, s.id, s.title, s.detail, s.date, s.time, s.done, s.score
  from scored s
  where (s.nq = '' and (from_date is not null or to_date is not null)) or s.score >= 0.5
  order by s.score desc, s.date desc nulls last, s.title
  limit least(greatest(coalesce(max_results, 40), 1), 100);
$$;

revoke execute on function public.search_all(text, text[], date, date, boolean, int) from public, anon;
grant execute on function public.search_all(text, text[], date, date, boolean, int) to authenticated;
