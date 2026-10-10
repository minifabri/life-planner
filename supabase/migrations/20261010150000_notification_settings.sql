-- Incremento 9: preferenze delle notifiche e registro degli invii (technical-design.md, 7.2).

-- Preferenze per livello di attenzione, fascia di silenzio e avvisi facoltativi.
alter table public.profiles
  add column notify_medium boolean not null default true,
  add column notify_high boolean not null default true,
  add column quiet_allow_high boolean not null default false,
  add column notify_meal_prep boolean not null default true,
  add column notify_morning boolean not null default false,
  add column notify_evening boolean not null default false;

-- Le notifiche si calcolano a ogni giro del cron dallo stato di attività ed eventi:
-- la chiave dice quale notifica è già stata presa in carico, così non parte due volte.
alter table public.reminders add column dedupe_key text;
create unique index reminders_owner_dedupe_key on public.reminders (owner_id, dedupe_key);
