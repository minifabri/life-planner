-- Incremento 40: `imayoga_is_configured()` era una funzione security definer eseguibile da
-- `authenticated` (avviso dell'advisor). Il controllo passa alla Edge Function `imayoga-feed`
-- (`{"action": "status"}`), che usa già la service role.
drop function public.imayoga_is_configured();
