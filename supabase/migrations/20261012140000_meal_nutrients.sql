-- Incrementi 20–22 — Pasti: nutrienti corretti a mano e idee nascoste.

-- Nutrienti del piatto scelti a mano; null = riconosciuti dal nome (lib/meals/nutrients.ts).
alter table public.meal_memory
  add column nutrients text[] check (nutrients <@ array['protein', 'carbs', 'fat', 'fiber']),
  -- "Non proporre": il piatto non compare più nelle Idee di questo momento.
  add column hidden_at timestamptz;
