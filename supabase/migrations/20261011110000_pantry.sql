-- In casa: un articolo della spesa spuntato resta disponibile per i pasti, anche dopo
-- "Svuota completati", finché non viene segnato come finito (technical-design.md, 5.1).
alter table public.shopping_items add column finished_at timestamptz;
