-- Incremento 14 — Guardaroba: fondamenta (catalogo capi + storage foto).
-- Vedi la proposta discussa con Bibi l'11 ottobre 2026: prima sezione a usare Supabase Storage.

create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text,
  -- Foto proprie (Storage, bucket privato "wardrobe"): "<owner_id>/<id>.jpg" e "..._thumb.jpg".
  image_path text,
  thumb_path text,
  -- Capi arrivati dalla wishlist senza foto propria: restano con l'immagine esterna finché non ne arriva una.
  image_url text,
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'bag', 'other')),
  subcategory text,
  colors text[] not null default '{}',
  seasons text[] not null default '{}',
  styles text[] not null default '{}',
  occasions text[] not null default '{}',
  material text,
  brand text,
  -- Leggerezza → pesantezza, per la stagionalità intelligente (non un vincolo rigido).
  warmth smallint check (warmth between 1 and 5),
  layerable boolean not null default true,
  status text not null default 'clean' check (status in ('clean', 'worn', 'to_wash')),
  favorite boolean not null default false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wardrobe_items_owner_idx on public.wardrobe_items (owner_id) where deleted_at is null;

create trigger wardrobe_items_set_updated_at before update on public.wardrobe_items
  for each row execute function public.set_updated_at();

alter table public.wardrobe_items enable row level security;
create policy wardrobe_items_select_own on public.wardrobe_items for select to authenticated using (owner_id = (select auth.uid()));
create policy wardrobe_items_insert_own on public.wardrobe_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy wardrobe_items_update_own on public.wardrobe_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy wardrobe_items_delete_own on public.wardrobe_items for delete to authenticated using (owner_id = (select auth.uid()));

-- Storage: bucket privato, un oggetto per capo, cartella per utente (RLS sul prefisso del path).
insert into storage.buckets (id, name, public) values ('wardrobe', 'wardrobe', false);

create policy wardrobe_storage_select_own on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_update_own on storage.objects for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
