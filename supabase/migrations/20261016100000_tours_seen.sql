-- Incremento 31 — Tour guidato (D65).
-- Quali tour ha già visto (o saltato) chi usa l'app: "intro" per il tour iniziale, poi uno per sezione.
-- Sul profilo, così un tour visto sull'iPhone non ricompare sul desktop. La RLS del profilo resta quella di sempre.
alter table public.profiles
  add column tours_seen text[] not null default '{}';
