-- Incremento 15 — Guardaroba: outfit e storico degli utilizzi.

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text,
  -- I capi dell'outfit come elenco di id di wardrobe_items: una modifica è una sola scrittura (outbox, offline).
  -- Nessuna copia delle immagini; un capo eliminato resta nell'elenco e l'app lo mostra come rimosso.
  item_ids uuid[] not null default '{}',
  styles text[] not null default '{}',
  occasions text[] not null default '{}',
  seasons text[] not null default '{}',
  favorite boolean not null default false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfits_owner_idx on public.outfits (owner_id) where deleted_at is null;

create trigger outfits_set_updated_at before update on public.outfits
  for each row execute function public.set_updated_at();

alter table public.outfits enable row level security;
create policy outfits_select_own on public.outfits for select to authenticated using (owner_id = (select auth.uid()));
create policy outfits_insert_own on public.outfits for insert to authenticated with check (owner_id = (select auth.uid()));
create policy outfits_update_own on public.outfits for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy outfits_delete_own on public.outfits for delete to authenticated using (owner_id = (select auth.uid()));

-- Un utilizzo effettivo: i capi indossati quel giorno, con l'outfit da cui venivano (se c'era).
create table public.wardrobe_wears (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worn_on date not null,
  outfit_id uuid references public.outfits (id) on delete set null,
  item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index wardrobe_wears_owner_day_idx on public.wardrobe_wears (owner_id, worn_on desc);
create index wardrobe_wears_outfit_idx on public.wardrobe_wears (outfit_id);

alter table public.wardrobe_wears enable row level security;
create policy wardrobe_wears_select_own on public.wardrobe_wears for select to authenticated using (owner_id = (select auth.uid()));
create policy wardrobe_wears_insert_own on public.wardrobe_wears for insert to authenticated with check (owner_id = (select auth.uid()));
create policy wardrobe_wears_update_own on public.wardrobe_wears for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy wardrobe_wears_delete_own on public.wardrobe_wears for delete to authenticated using (owner_id = (select auth.uid()));
