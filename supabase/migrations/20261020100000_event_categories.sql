-- Categorie degli eventi riconosciute dal titolo (D72): appuntamenti, viaggi, soggiorni, biglietti,
-- prenotazioni e scadenze, oltre a spedizioni e compleanni. Vedi docs/technical-design.md, sezione 9.1d.
-- I giorni in viaggio non si salvano: si ricavano dagli eventi. "Non in viaggio" per un giorno va in
-- question_answers (chiave "travel:<giorno>"), che ha già RLS e le quattro policy.

alter table public.events drop constraint events_kind_check;
alter table public.events
  add constraint events_kind_check
  check (kind in ('event', 'shipment', 'birthday', 'appointment', 'travel', 'stay', 'ticket', 'reservation', 'deadline'));
