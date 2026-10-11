-- Verifica della Row Level Security (da eseguire nel SQL editor o via MCP).
-- Crea due utenti fittizi dentro una transazione e fa rollback alla fine: non lascia tracce.
-- Risultato atteso: A vede 1 attività, 1 allenamento, 1 collegamento a Salute e 1/2/6/5; tutte le altre righe 0 o "bloccato: 42501".
begin;
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('11111111-1111-1111-1111-111111111111', 'rls-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
 ('22222222-2222-2222-2222-222222222222', 'rls-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

create temp table r (test text, result text);
grant all on r to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.tasks (title) values ('Attività di A');
insert into r select 'A vede le proprie attività', (select count(*) from public.tasks)::text;
insert into public.workouts (activity, date) values ('Corsa di A', current_date);
insert into r select 'A vede i propri allenamenti', (select count(*) from public.workouts)::text;
insert into public.health_links (token_hash) values (repeat('a', 64));
insert into r select 'A vede il proprio collegamento a Salute', (select count(*) from public.health_links)::text;
insert into r select 'A: profilo/liste/categorie/aree', (select count(*) from public.profiles)||'/'||(select count(*) from public.lists)||'/'||(select count(*) from public.log_categories)||'/'||(select count(*) from public.areas);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into r select 'B vede attività di A', (select count(*) from public.tasks)::text;
insert into r select 'B vede profili altrui', (select count(*) from public.profiles where owner_id <> '22222222-2222-2222-2222-222222222222')::text;
with u as (update public.tasks set title = 'manomessa' returning 1) insert into r select 'B modifica attività di A', (select count(*) from u)::text;
with d as (delete from public.tasks returning 1) insert into r select 'B cancella attività di A', (select count(*) from d)::text;
insert into r select 'B vede allenamenti di A', (select count(*) from public.workouts)::text;
with u as (update public.workouts set activity = 'manomesso' returning 1) insert into r select 'B modifica allenamenti di A', (select count(*) from u)::text;
with d as (delete from public.workouts returning 1) insert into r select 'B cancella allenamenti di A', (select count(*) from d)::text;
insert into r select 'B vede il collegamento a Salute di A', (select count(*) from public.health_links)::text;
with u as (update public.health_links set token_hash = repeat('b', 64) returning 1) insert into r select 'B cambia il token di A', (select count(*) from u)::text;
with d as (delete from public.health_links returning 1) insert into r select 'B revoca il token di A', (select count(*) from d)::text;
do $$ begin
  begin
    insert into public.health_links (owner_id, token_hash) values ('11111111-1111-1111-1111-111111111111', repeat('c', 64));
    insert into r values ('B crea un token a nome di A', 'RIUSCITO (errore)');
  exception when others then
    insert into r values ('B crea un token a nome di A', 'bloccato: ' || sqlstate);
  end;
end $$;
do $$ begin
  begin
    insert into public.workouts (owner_id, activity, date) values ('11111111-1111-1111-1111-111111111111', 'intrusione', current_date);
    insert into r values ('B inserisce allenamenti a nome di A', 'RIUSCITO (errore)');
  exception when others then
    insert into r values ('B inserisce allenamenti a nome di A', 'bloccato: ' || sqlstate);
  end;
end $$;
do $$ begin
  begin
    insert into public.tasks (owner_id, title) values ('11111111-1111-1111-1111-111111111111', 'intrusione');
    insert into r values ('B inserisce a nome di A', 'RIUSCITO (errore)');
  exception when others then
    insert into r values ('B inserisce a nome di A', 'bloccato: ' || sqlstate);
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into r select 'anon vede attività', (select count(*) from public.tasks)::text;
insert into r select 'anon vede allenamenti', (select count(*) from public.workouts)::text;
insert into r select 'anon vede collegamenti a Salute', (select count(*) from public.health_links)::text;
do $$ begin
  begin
    perform public.get_dispatch_config();
    insert into r values ('anon legge config notifiche', 'RIUSCITO (errore)');
  exception when others then
    insert into r values ('anon legge config notifiche', 'bloccato: ' || sqlstate);
  end;
end $$;
reset role;
select * from r;
rollback;
