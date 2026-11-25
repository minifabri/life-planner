-- Incremento 40 — Altri account, gestiti da Bibi (D76). Vedi docs/technical-design.md, 4.1 e 13.
--
-- 1. app_admins: chi può aggiungere, disattivare ed eliminare account (Edge Function `admin-users`).
--    Dal client si legge solo la propria riga, per sapere se mostrare Impostazioni › Account; nessuna
--    scrittura dal client: le righe si inseriscono a mano via SQL. La riga di Bibi è stata inserita
--    subito dopo questa migrazione, fuori dal file.
-- 2. handle_new_user: valori di partenza generici per gli account nuovi, senza nome (lo chiede l'app
--    al primo accesso) e senza la categoria Ciclo. Gli account esistenti non cambiano.
-- 3. imayoga_is_configured(): dice solo se chi chiama ha il segreto di imayoga, per nascondere la
--    sezione a chi non l'ha. Tolta subito dopo (20261125101000): il controllo passa a `imayoga-feed`.

-- ---------------------------------------------------------------
-- 1. Amministrazione
-- ---------------------------------------------------------------
create table public.app_admins (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

create policy app_admins_select_own on public.app_admins
  for select to authenticated using (owner_id = (select auth.uid()));
-- Le altre tre policy negano sempre: diventare amministratore dal client non deve essere possibile.
create policy app_admins_insert_none on public.app_admins
  for insert to authenticated with check (false);
create policy app_admins_update_none on public.app_admins
  for update to authenticated using (false) with check (false);
create policy app_admins_delete_none on public.app_admins
  for delete to authenticated using (false);

-- ---------------------------------------------------------------
-- 2. Valori di partenza degli account nuovi
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (owner_id, display_name)
  values (new.id, null);

  insert into public.lists (owner_id, kind, name)
  values (new.id, 'shopping', 'Spesa'), (new.id, 'wishlist', 'Wishlist');

  insert into public.log_categories (owner_id, name, color, is_sensitive, keywords, sort_order)
  values
    (new.id, 'Salute', '#82A8EC', true, array['salute', 'medico', 'visita', 'farmaco', 'terapia'], 1),
    (new.id, 'Cura personale', '#79C7B5', false, array['parrucchiere', 'capelli', 'unghie', 'estetista'], 2),
    (new.id, 'Personale', '#A3A9B8', false, array[]::text[], 3);

  insert into public.areas (owner_id, name, color_dark, color_light, sort_order)
  values
    (new.id, 'Lavoro', '#82A8EC', '#3F6FC4', 1),
    (new.id, 'Casa', '#A3A9B8', '#6F7687', 2),
    (new.id, 'Salute e benessere', '#79C7B5', '#2E8C76', 3),
    (new.id, 'Tempo libero', '#B9A4FF', '#6B4FD8', 4),
    (new.id, 'Persone', '#E7A2C6', '#B8508A', 5);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 3. imayoga configurato?
-- ---------------------------------------------------------------
create or replace function public.imayoga_is_configured()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.secrets where name = 'imayoga:' || (select auth.uid())::text);
$$;

revoke execute on function public.imayoga_is_configured() from public, anon;
grant execute on function public.imayoga_is_configured() to authenticated;
