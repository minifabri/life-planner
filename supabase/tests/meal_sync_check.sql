-- Verifica dei trigger pasto ↔ attività (da eseguire nel SQL editor o via MCP).
-- Crea un utente fittizio dentro una transazione e fa rollback alla fine: non lascia tracce.
-- Risultato atteso: ogni riga "ok".
begin;
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', 'meal-sync@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

create temp table r (n serial, test text, result text);
grant all on r to public;
grant usage on sequence r_n_seq to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

-- Come fa il client: pasto, attività del giorno prima, collegamento.
insert into public.meal_plans (id, date, slot, name, prep_mode)
  values ('aaaaaaaa-0000-4000-8000-000000000001', current_date + 2, 'lunch', 'Riso e lenticchie', 'to_prep');
insert into public.tasks (id, title, date, source, meal_plan_id)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'Preparare il pranzo di domani', current_date + 1, 'meal', 'aaaaaaaa-0000-4000-8000-000000000001');
update public.meal_plans set reminder_task_id = 'bbbbbbbb-0000-4000-8000-000000000001' where id = 'aaaaaaaa-0000-4000-8000-000000000001';

update public.tasks set status = 'done', completed_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000001';
insert into r (test, result) select 'attività spuntata → pasto preparato',
  case when prepared and prepared_at is not null then 'ok' else 'ERRORE' end from public.meal_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001';

update public.tasks set status = 'open', completed_at = null where id = 'bbbbbbbb-0000-4000-8000-000000000001';
insert into r (test, result) select 'attività rimessa da fare → pasto non preparato',
  case when not prepared and prepared_at is null then 'ok' else 'ERRORE' end from public.meal_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001';

update public.meal_plans set prepared = true, prepared_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into r (test, result) select 'Preparato dal planner → attività completata',
  case when status = 'done' and completed_at is not null then 'ok' else 'ERRORE' end from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001';

update public.meal_plans set prepared = false, prepared_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into r (test, result) select 'Preparato tolto → attività da fare',
  case when status = 'open' and completed_at is null then 'ok' else 'ERRORE' end from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001';

update public.tasks set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000001';
insert into r (test, result) select 'attività eliminata → resta il pasto da preparare, senza promemoria',
  case when prep_mode = 'to_prep' and not prepared and reminder_task_id is null then 'ok' else 'ERRORE' end from public.meal_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Nuova attività (come quando si torna a "Da preparare"), poi il pasto passa a Pronto.
insert into public.tasks (id, title, date, source, meal_plan_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'Preparare il pranzo di domani', current_date + 1, 'meal', 'aaaaaaaa-0000-4000-8000-000000000001');
update public.meal_plans set reminder_task_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.meal_plans set prep_mode = 'ready' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into r (test, result) select 'pasto passato a Pronto → attività eliminata',
  case when deleted_at is not null then 'ok' else 'ERRORE' end from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000002';
insert into r (test, result) select 'pasto passato a Pronto → promemoria scollegato',
  case when reminder_task_id is null then 'ok' else 'ERRORE' end from public.meal_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Pasto eliminato con un'attività ancora aperta.
update public.meal_plans set prep_mode = 'to_prep' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into public.tasks (id, title, date, source, meal_plan_id)
  values ('bbbbbbbb-0000-4000-8000-000000000003', 'Preparare il pranzo di domani', current_date + 1, 'meal', 'aaaaaaaa-0000-4000-8000-000000000001');
update public.meal_plans set reminder_task_id = 'bbbbbbbb-0000-4000-8000-000000000003' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.meal_plans where id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into r (test, result) select 'pasto eliminato → attività eliminata',
  case when deleted_at is not null and meal_plan_id is null then 'ok' else 'ERRORE' end from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000003';

-- Un'attività normale non tocca nulla.
insert into public.tasks (id, title) values ('bbbbbbbb-0000-4000-8000-000000000004', 'Attività qualsiasi');
update public.tasks set status = 'done' where id = 'bbbbbbbb-0000-4000-8000-000000000004';
insert into r (test, result) select 'attività normale → nessun effetto', case when count(*) = 0 then 'ok' else 'ERRORE' end from public.meal_plans;

reset role;
select test, result from r order by n;
rollback;
