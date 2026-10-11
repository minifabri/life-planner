-- Incremento 16 — Guardaroba: profilo di stile e feedback sui suggerimenti.

-- Una riga per utente: orientamenti usati dal motore dei suggerimenti (mai divieti).
create table public.wardrobe_style (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  liked_styles text[] not null default '{}',
  liked_colors text[] not null default '{}',
  avoid text[] not null default '{}',
  -- Pesi dei fattori, solo se diversi da quelli predefiniti dell'app.
  weights jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wardrobe_style_set_updated_at before update on public.wardrobe_style
  for each row execute function public.set_updated_at();

alter table public.wardrobe_style enable row level security;
create policy wardrobe_style_select_own on public.wardrobe_style for select to authenticated using (owner_id = (select auth.uid()));
create policy wardrobe_style_insert_own on public.wardrobe_style for insert to authenticated with check (owner_id = (select auth.uid()));
create policy wardrobe_style_update_own on public.wardrobe_style for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy wardrobe_style_delete_own on public.wardrobe_style for delete to authenticated using (owner_id = (select auth.uid()));

-- Giudizi espliciti ("Mi piace" / "Non mi piace") su una combinazione di capi.
create table public.outfit_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_ids uuid[] not null,
  -- Id ordinati e uniti da "|": identifica la combinazione a prescindere dall'ordine.
  signature text not null,
  verdict text not null check (verdict in ('like', 'dislike')),
  created_at timestamptz not null default now()
);

create index outfit_feedback_owner_idx on public.outfit_feedback (owner_id, signature);

alter table public.outfit_feedback enable row level security;
create policy outfit_feedback_select_own on public.outfit_feedback for select to authenticated using (owner_id = (select auth.uid()));
create policy outfit_feedback_insert_own on public.outfit_feedback for insert to authenticated with check (owner_id = (select auth.uid()));
create policy outfit_feedback_update_own on public.outfit_feedback for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy outfit_feedback_delete_own on public.outfit_feedback for delete to authenticated using (owner_id = (select auth.uid()));
