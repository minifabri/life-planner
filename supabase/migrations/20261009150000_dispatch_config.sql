-- Configurazione per l'invio delle notifiche, letta dalla Edge Function con la service role.
-- I segreti vivono in Vault (creati a mano, non in questa migrazione).
create or replace function public.get_dispatch_config()
returns table (cron_secret text, vapid_public_key text, vapid_private_key text, vapid_subject text)
language sql
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject');
$$;

revoke execute on function public.get_dispatch_config() from public, anon, authenticated;
grant execute on function public.get_dispatch_config() to service_role;
