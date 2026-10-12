-- Incremento 27: promemoria sulle attività con una data (Product Definition D2).
-- Il flag chiede una notifica all'orario dell'attività (al mattino se non ha un orario), qualunque sia l'attenzione.
-- Le regole restano in lib/reminders/plan.ts: la Edge Function le applica a ogni giro del cron.
alter table public.tasks add column remind boolean not null default false;
