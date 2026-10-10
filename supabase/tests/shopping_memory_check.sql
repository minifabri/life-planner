-- Verifica del catalogo appreso della spesa (da eseguire nel SQL editor o via MCP).
-- Crea due utenti fittizi dentro una transazione e fa rollback alla fine: non lascia tracce.
-- Risultato atteso: ogni riga ha result = expected.
begin;
insert into auth.users (id, email, aud, role, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('11111111-1111-1111-1111-111111111111', 'shop-a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now()),
 ('22222222-2222-2222-2222-222222222222', 'shop-b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now());

create temp table r (test text, result text, expected text);
grant all on r to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.shopping_items (id, list_id, name)
select '00000000-0000-0000-0000-00000000000a', id, '  Caffè   d''Orzo ' from public.lists where kind = 'shopping';
insert into r select 'nuovo articolo: entra nel catalogo, mai comprato',
  (select name_normalized || '|' || display_name || '|' || coalesce(department, '-') || '|' || use_count from public.product_memory),
  'caffe d''orzo|Caffè   d''Orzo|-|0';

update public.shopping_items set department = 'Dispensa' where id = '00000000-0000-0000-0000-00000000000a';
insert into r select 'reparto assegnato: il catalogo impara', (select department from public.product_memory), 'Dispensa';

update public.shopping_items set checked = true, checked_at = '2026-10-10T09:00:00Z' where id = '00000000-0000-0000-0000-00000000000a';
insert into r select 'spuntato: use_count e last_used_at',
  (select use_count || '|' || (last_used_at = '2026-10-10T09:00:00Z') from public.product_memory), '1|true';

update public.shopping_items set checked = false, checked_at = null where id = '00000000-0000-0000-0000-00000000000a';
insert into r select 'spunta tolta: use_count torna indietro', (select use_count::text from public.product_memory), '0';

update public.shopping_items set checked = true, checked_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update public.shopping_items set deleted_at = now() where id = '00000000-0000-0000-0000-00000000000a';
insert into r select 'svuota completati: il catalogo non cambia', (select use_count || '|' || department from public.product_memory), '1|Dispensa';

insert into public.shopping_items (id, list_id, name)
select '00000000-0000-0000-0000-00000000000b', id, 'caffe d''orzo' from public.lists where kind = 'shopping';
insert into r select 'riaggiunto: eredita il reparto',
  (select department from public.shopping_items where id = '00000000-0000-0000-0000-00000000000b'), 'Dispensa';
insert into r select 'riaggiunto: nessun doppione nel catalogo', (select count(*) || '|' || max(use_count) from public.product_memory), '1|1';

update public.shopping_items set department = null where id = '00000000-0000-0000-0000-00000000000b';
insert into r select 'reparto tolto: il catalogo lo dimentica', (select coalesce(department, '-') from public.product_memory), '-';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into r select 'B non vede il catalogo di A', (select count(*)::text from public.product_memory), '0';
do $$ begin
  begin
    insert into public.shopping_items (owner_id, list_id, name)
    select '11111111-1111-1111-1111-111111111111', id, 'intrusione' from public.lists where kind = 'shopping';
    insert into r values ('B scrive nel catalogo di A', 'RIUSCITO (errore)', 'bloccato: 42501');
  exception when others then
    insert into r values ('B scrive nel catalogo di A', 'bloccato: ' || sqlstate, 'bloccato: 42501');
  end;
end $$;

reset role;
select test, result, expected, result is not distinct from expected as ok from r;
rollback;
