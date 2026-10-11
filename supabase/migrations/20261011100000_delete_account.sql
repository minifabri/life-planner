-- Incremento 13: eliminazione dell'account (technical-design.md, 10).
-- Le righe di tutte le tabelle spariscono a cascata con l'utente (`on delete cascade` verso auth.users).
-- Restano da togliere a mano i segreti in Vault legati alla persona: credenziali iCloud e feed imayoga.
create or replace function public.delete_account_secrets(p_owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name in ('icloud:' || p_owner::text, 'imayoga:' || p_owner::text);
$$;

revoke execute on function public.delete_account_secrets(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_secrets(uuid) to service_role;
