-- Incremento 39 — GPT personalizzato "Life Planner": Azioni di ChatGPT con token personale.
-- Vedi docs/technical-design.md, sezione 9.9.

-- ---------------------------------------------------------------
-- Collegamento: una riga per chi usa il GPT. Del token si conserva solo l'impronta SHA-256;
-- eliminare la riga lo revoca. È separato da quello di Salute, così si revocano uno alla volta.
-- ---------------------------------------------------------------
create table public.chatgpt_links (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger chatgpt_links_set_updated_at before update on public.chatgpt_links
  for each row execute function public.set_updated_at();

alter table public.chatgpt_links enable row level security;

create policy chatgpt_links_select_own on public.chatgpt_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy chatgpt_links_insert_own on public.chatgpt_links
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy chatgpt_links_update_own on public.chatgpt_links
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy chatgpt_links_delete_own on public.chatgpt_links
  for delete to authenticated using (owner_id = (select auth.uid()));
