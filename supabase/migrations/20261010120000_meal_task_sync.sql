-- Incremento 5 — Planner pasti: il pasto e la sua attività di preparazione restano allineati.
-- Le stesse regole sono nel client (lib/meals/rules.ts), che le applica subito all'interfaccia;
-- qui valgono nella stessa transazione della modifica, così il database resta coerente
-- anche con modifiche fatte offline e sincronizzate dopo, o arrivate a metà.
--
-- Le funzioni girano con i permessi di chi scrive (nessun security definer): la RLS resta in vigore.
-- Ogni aggiornamento tocca solo righe che devono davvero cambiare, quindi i due trigger non si rincorrono.

-- Attività di preparazione → pasto.
create or replace function public.tasks_sync_meal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source <> 'meal' or new.meal_plan_id is null then
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    -- Eliminata: sparisce solo il promemoria, il pasto resta da preparare.
    update public.meal_plans
      set reminder_task_id = null
      where id = new.meal_plan_id and reminder_task_id = new.id;
  elsif new.deleted_at is null and new.status is distinct from old.status then
    if new.status = 'done' then
      update public.meal_plans
        set prepared = true, prepared_at = coalesce(new.completed_at, now())
        where id = new.meal_plan_id and not prepared;
    elsif new.status = 'open' then
      update public.meal_plans
        set prepared = false, prepared_at = null
        where id = new.meal_plan_id and prepared;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_sync_meal() from public, anon;

create trigger tasks_sync_meal
  after update of status, deleted_at on public.tasks
  for each row execute function public.tasks_sync_meal();

-- Pasto → attività di preparazione.
create or replace function public.meal_plans_sync_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Pasto eliminato: via anche la sua attività.
    update public.tasks
      set deleted_at = now()
      where meal_plan_id = old.id and source = 'meal' and deleted_at is null;
    return old;
  end if;

  if new.prep_mode = 'ready' and old.prep_mode = 'to_prep' then
    -- Passato a Pronto: l'attività non serve più.
    update public.tasks
      set deleted_at = now()
      where meal_plan_id = new.id and source = 'meal' and deleted_at is null;
  elsif new.prepared is distinct from old.prepared and new.reminder_task_id is not null then
    if new.prepared then
      update public.tasks
        set status = 'done', completed_at = coalesce(new.prepared_at, now())
        where id = new.reminder_task_id and deleted_at is null and status = 'open';
    else
      update public.tasks
        set status = 'open', completed_at = null
        where id = new.reminder_task_id and deleted_at is null and status = 'done';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.meal_plans_sync_task() from public, anon;

create trigger meal_plans_sync_task
  after update of prep_mode, prepared on public.meal_plans
  for each row execute function public.meal_plans_sync_task();

-- Prima della cancellazione: dopo, la chiave esterna avrebbe già scollegato l'attività.
create trigger meal_plans_delete_task
  before delete on public.meal_plans
  for each row execute function public.meal_plans_sync_task();
