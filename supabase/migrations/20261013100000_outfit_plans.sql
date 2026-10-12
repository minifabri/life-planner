-- Incremento 17 — Guardaroba: outfit pianificati per un giorno, un evento o un'occasione.
-- Una pianificazione non è un utilizzo (wardrobe_wears) e non crea eventi nel calendario.

create table public.outfit_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  -- Evento del giorno a cui è legato, se c'è. Se l'evento sparisce resta la pianificazione del giorno.
  event_id uuid references public.events (id) on delete set null,
  -- Titolo dell'evento al momento della scelta, oppure un'occasione scritta a mano ("Cena fuori").
  label text,
  -- Outfit salvato da cui nasce, se c'è: finché esiste valgono i suoi capi, altrimenti quelli qui sotto.
  outfit_id uuid references public.outfits (id) on delete set null,
  item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfit_plans_owner_date_idx on public.outfit_plans (owner_id, date);
create index outfit_plans_event_idx on public.outfit_plans (event_id);
create index outfit_plans_outfit_idx on public.outfit_plans (outfit_id);

create trigger outfit_plans_set_updated_at before update on public.outfit_plans
  for each row execute function public.set_updated_at();

alter table public.outfit_plans enable row level security;
create policy outfit_plans_select_own on public.outfit_plans for select to authenticated using (owner_id = (select auth.uid()));
create policy outfit_plans_insert_own on public.outfit_plans for insert to authenticated with check (owner_id = (select auth.uid()));
create policy outfit_plans_update_own on public.outfit_plans for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy outfit_plans_delete_own on public.outfit_plans for delete to authenticated using (owner_id = (select auth.uid()));
