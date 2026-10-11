-- Incremento 7c — Salute di Apple: collegamento in sola lettura tramite Comando rapido.
-- Vedi docs/technical-design.md, sezione 9.8.

-- ---------------------------------------------------------------
-- Collegamento: una riga per chi manda gli allenamenti da Salute.
-- Del token personale si conserva solo l'impronta SHA-256; eliminare la riga lo revoca.
-- ---------------------------------------------------------------
create table public.health_links (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger health_links_set_updated_at before update on public.health_links
  for each row execute function public.set_updated_at();

alter table public.health_links enable row level security;

create policy health_links_select_own on public.health_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy health_links_insert_own on public.health_links
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy health_links_update_own on public.health_links
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy health_links_delete_own on public.health_links
  for delete to authenticated using (owner_id = (select auth.uid()));
