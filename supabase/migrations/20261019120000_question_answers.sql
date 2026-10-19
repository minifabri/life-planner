-- Risposte alle domande dell'app (D70: chiedere, non decidere). Prima caso: i pacchi arrivati (D71).
--
-- Una risposta data non deve tornare a chiedere: né su un altro dispositivo, né se poi si cancella
-- l'articolo nato dalla risposta. Per questo si salva qui, sul server, e non sul dispositivo.
-- `key` dice a quale domanda si è risposto (es. "ship:<evento>" per un pacco già deciso,
-- "ship:<evento>:<giorno>" per "Non è arrivato"); `answer` è la scelta fatta.

create table public.question_answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  answer text not null check (char_length(answer) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner_id, key)
);

alter table public.question_answers enable row level security;
create policy question_answers_select_own on public.question_answers for select to authenticated using (owner_id = (select auth.uid()));
create policy question_answers_insert_own on public.question_answers for insert to authenticated with check (owner_id = (select auth.uid()));
create policy question_answers_update_own on public.question_answers for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy question_answers_delete_own on public.question_answers for delete to authenticated using (owner_id = (select auth.uid()));

-- I pacchi a cui si è già risposto, anche se l'articolo è stato cancellato dopo.
insert into public.question_answers (owner_id, key, answer)
select distinct on (owner_id, shipment_event_id) owner_id, 'ship:' || shipment_event_id, 'answered'
from public.wishlist_items
where shipment_event_id is not null
on conflict (owner_id, key) do nothing;
