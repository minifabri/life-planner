-- Incremento 18 — Guardaroba e Wishlist: un articolo desiderato può essere un capo, e un acquisto diventa un capo.

-- Dati di abbigliamento di un articolo della wishlist (facoltativi; `category` resta il testo libero di prima).
alter table public.wishlist_items
  add column garment text check (garment in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'bag', 'other')),
  add column colors text[] not null default '{}',
  add column styles text[] not null default '{}';

-- Il capo nato da un articolo della wishlist ricorda da dove viene.
alter table public.wardrobe_items
  add column wishlist_item_id uuid references public.wishlist_items (id) on delete set null;

create index wardrobe_items_wishlist_idx on public.wardrobe_items (wishlist_item_id) where wishlist_item_id is not null;
