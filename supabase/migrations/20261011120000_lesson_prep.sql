-- Lezioni di imayoga: persone prenotate nel dettaglio e attività di preparazione.
-- Vedi docs/technical-design.md, sezione 9.2.

-- Dettaglio della lezione letto dal feed: posti, prenotati, lista d'attesa, allieva assegnata.
-- Lo scrive solo la sync di imayoga; resta null per tutti gli altri eventi.
alter table public.events add column lesson jsonb;

-- Attività "Preparare la lezione": collegata all'evento, come quella di un pasto al suo pasto.
alter table public.tasks add column event_id uuid references public.events (id) on delete set null;

alter table public.tasks drop constraint tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'recurrence', 'template', 'meal', 'lesson'));

create index tasks_event_idx on public.tasks (event_id) where event_id is not null;
