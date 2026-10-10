-- Correzione di 20261010120000: l'eliminazione del pasto passava da un trigger BEFORE DELETE,
-- ma eliminare l'attività collegata fa scattare tasks_sync_meal, che prova a modificare
-- proprio il pasto in cancellazione (errore 27000). Ora si agisce dopo la cancellazione,
-- partendo dal collegamento che il pasto aveva.

drop trigger meal_plans_delete_task on public.meal_plans;

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
      where id = old.reminder_task_id and deleted_at is null;
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

create trigger meal_plans_delete_task
  after delete on public.meal_plans
  for each row execute function public.meal_plans_sync_task();
