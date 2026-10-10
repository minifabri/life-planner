-- Incremento 4 — Spesa: catalogo appreso (product_memory) e Realtime.
-- Il catalogo si aggiorna nella stessa transazione dell'articolo, così resta coerente
-- anche con modifiche fatte offline e sincronizzate dopo.

create or replace function public.normalize_product_name(name text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(extensions.unaccent('extensions.unaccent'::regdictionary, name)), '\s+', ' ', 'g'));
$$;

revoke execute on function public.normalize_product_name(text) from public, anon;
grant execute on function public.normalize_product_name(text) to authenticated, service_role;

-- Nuovo articolo: eredita il reparto imparato. Reparto o nome modificati: il catalogo impara.
-- Articolo spuntato: use_count + 1 e last_used_at; spunta tolta: use_count - 1.
create or replace function public.shopping_items_learn()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  norm text := public.normalize_product_name(new.name);
  bought int := 0;
begin
  if norm = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.department is null then
      new.department := (
        select m.department from public.product_memory m
        where m.owner_id = new.owner_id and m.name_normalized = norm
      );
    end if;
    if new.checked then
      bought := 1;
    end if;
  else
    if new.checked and not old.checked then
      bought := 1;
    elsif old.checked and not new.checked then
      bought := -1;
    end if;
    if bought = 0 and new.name = old.name and new.department is not distinct from old.department then
      return new;
    end if;
  end if;

  insert into public.product_memory as m (owner_id, name_normalized, display_name, department, use_count, last_used_at)
  values (
    new.owner_id, norm, btrim(new.name), new.department,
    greatest(bought, 0),
    case when bought = 1 then coalesce(new.checked_at, now()) end
  )
  on conflict (owner_id, name_normalized) do update set
    display_name = excluded.display_name,
    department = excluded.department,
    use_count = greatest(m.use_count + bought, 0),
    last_used_at = case when bought = 1 then excluded.last_used_at else m.last_used_at end;

  return new;
end;
$$;

revoke execute on function public.shopping_items_learn() from public, anon;

create trigger shopping_items_learn
  before insert or update on public.shopping_items
  for each row execute function public.shopping_items_learn();

-- Articoli già presenti (aggiunti dal Quick Capture prima di questo incremento).
insert into public.product_memory (owner_id, name_normalized, display_name, department, use_count, last_used_at)
select
  owner_id,
  public.normalize_product_name(name),
  (array_agg(btrim(name) order by created_at desc))[1],
  (array_agg(department order by created_at desc) filter (where department is not null))[1],
  count(*) filter (where checked),
  max(checked_at)
from public.shopping_items
where public.normalize_product_name(name) <> ''
group by 1, 2
on conflict (owner_id, name_normalized) do nothing;

-- Realtime sulla sola lista della spesa (technical-design.md, 6.1).
alter publication supabase_realtime add table public.shopping_items;
