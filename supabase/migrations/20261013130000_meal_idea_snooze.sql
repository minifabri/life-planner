-- Pasti, Idee: "Meno spesso". Il piatto non viene proposto in questo momento fino al giorno indicato;
-- poi torna da solo. "Non proporre" (hidden_at) resta la scelta senza scadenza.
alter table public.meal_memory add column snoozed_until date;
