-- Incremento 20 — Guardaroba: riconoscimento del capo dalla foto (facoltativo).
-- La chiave del servizio di visione sta in Vault (segreto `anthropic_api_key`), letta solo dalla Edge Function
-- `wardrobe-recognize` (service role). Senza il segreto la funzione risponde "non configurato" e l'app resta com'è.
create or replace function public.wardrobe_ai_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'anthropic_api_key';
$$;

revoke execute on function public.wardrobe_ai_key() from public, anon, authenticated;
grant execute on function public.wardrobe_ai_key() to service_role;
