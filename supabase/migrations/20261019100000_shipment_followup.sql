-- Pacchi arrivati (D71): dopo una spedizione l'app chiede com'è andata (D70: chiedere, non decidere).
--
-- 1. Un articolo può nascere da una spedizione (`shipment_event_id`, il giorno in `arrived_on`), o un articolo
--    della wishlist può esserle collegato.
-- 2. Nuovi stati: `arrived` (arrivato, decisione rimandata: "Ci penso più tardi"), `returning` (da restituire,
--    entro `return_by`, con l'attività `return_task_id`), `returned` (restituito).
-- 3. Completare l'attività di restituzione segna l'articolo come restituito; riaprirla lo rimette da restituire.
--    È la stessa scelta esplicita, fatta da Oggi: niente viene deciso al posto di chi usa l'app.

alter table public.wishlist_items drop constraint wishlist_items_status_check;
alter table public.wishlist_items add constraint wishlist_items_status_check
  check (status in ('wanted', 'bought', 'discarded', 'arrived', 'returning', 'returned'));

alter table public.wishlist_items
  add column shipment_event_id uuid references public.events (id) on delete set null,
  add column arrived_on date,
  add column return_by date,
  add column return_task_id uuid references public.tasks (id) on delete set null;

create index wishlist_items_shipment_idx on public.wishlist_items (shipment_event_id) where shipment_event_id is not null;
create index wishlist_items_return_task_idx on public.wishlist_items (return_task_id) where return_task_id is not null;

alter table public.tasks drop constraint tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'recurrence', 'template', 'meal', 'lesson', 'shopping', 'laundry', 'return'));

-- Attività di restituzione → articolo. Gira con i permessi di chi scrive: la RLS resta in vigore.
create or replace function public.tasks_sync_return()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source <> 'return' or new.deleted_at is not null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'done' then
    update public.wishlist_items set status = 'returned'
      where return_task_id = new.id and status = 'returning';
  elsif new.status = 'open' then
    update public.wishlist_items set status = 'returning'
      where return_task_id = new.id and status = 'returned';
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_sync_return() from public, anon;

create trigger tasks_sync_return
  after update of status on public.tasks
  for each row execute function public.tasks_sync_return();
