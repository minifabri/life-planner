-- Spesa: articoli urgenti. Segnare un articolo come urgente crea un'attività "Comprare …"
-- da completare entro due giorni (lib/shopping/urgent.ts). Articolo e attività restano allineati:
-- comprato ↔ completata, eliminato ↔ eliminata, rinominato ↔ titolo nuovo.
--
-- Come per i pasti (20261010120000_meal_task_sync.sql) il client applica le stesse regole subito;
-- i trigger le ripetono nella stessa transazione, così il database resta coerente anche con modifiche
-- fatte offline e sincronizzate dopo. Girano con i permessi di chi scrive (la RLS resta in vigore) e
-- toccano solo righe che devono davvero cambiare, quindi non si rincorrono.

alter table public.shopping_items
  add column urgent boolean not null default false,
  add column task_id uuid references public.tasks (id) on delete set null;

alter table public.tasks
  add column shopping_item_id uuid references public.shopping_items (id) on delete set null;

alter table public.tasks drop constraint tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'recurrence', 'template', 'meal', 'lesson', 'shopping'));

create index shopping_items_task_idx on public.shopping_items (task_id) where task_id is not null;
create index tasks_shopping_item_idx on public.tasks (shopping_item_id) where shopping_item_id is not null;

-- Attività → articolo.
create or replace function public.tasks_sync_shopping()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source <> 'shopping' or new.shopping_item_id is null then
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    -- Eliminata da Today: l'articolo resta in lista, non più urgente.
    -- Se è l'articolo a essere stato eliminato, resta com'è (un annulla rimette entrambi).
    update public.shopping_items
      set urgent = false, task_id = null
      where id = new.shopping_item_id and task_id = new.id and deleted_at is null;
  elsif new.deleted_at is null and new.status is distinct from old.status then
    if new.status = 'done' then
      update public.shopping_items
        set checked = true, checked_at = coalesce(new.completed_at, now())
        where id = new.shopping_item_id and not checked;
    elsif new.status = 'open' then
      update public.shopping_items
        set checked = false, checked_at = null
        where id = new.shopping_item_id and checked;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_sync_shopping() from public, anon;

create trigger tasks_sync_shopping
  after update of status, deleted_at on public.tasks
  for each row execute function public.tasks_sync_shopping();

-- Articolo → attività.
create or replace function public.shopping_items_sync_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.task_id is null then
    return new;
  end if;

  if old.urgent and not new.urgent then
    -- Non più urgente: l'attività ancora da fare non serve più.
    update public.tasks
      set deleted_at = now()
      where id = old.task_id and deleted_at is null and status = 'open';
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    -- Tolto dalla lista: via l'attività ancora da fare; quella completata resta nella giornata.
    update public.tasks
      set deleted_at = now()
      where id = old.task_id and deleted_at is null and status = 'open';
  elsif new.deleted_at is null and old.deleted_at is not null then
    -- Eliminazione annullata: torna anche l'attività.
    update public.tasks
      set deleted_at = null
      where id = old.task_id and deleted_at is not null and status = 'open';
  end if;

  if new.checked is distinct from old.checked then
    if new.checked then
      update public.tasks
        set status = 'done', completed_at = coalesce(new.checked_at, now())
        where id = old.task_id and status = 'open';
    else
      update public.tasks
        set status = 'open', completed_at = null
        where id = old.task_id and status = 'done';
    end if;
  end if;

  if new.name is distinct from old.name then
    update public.tasks
      set title = 'Comprare ' || btrim(new.name)
      where id = old.task_id and title is distinct from 'Comprare ' || btrim(new.name);
  end if;
  return new;
end;
$$;

revoke execute on function public.shopping_items_sync_task() from public, anon;

create trigger shopping_items_sync_task
  after update of urgent, deleted_at, checked, name on public.shopping_items
  for each row execute function public.shopping_items_sync_task();
