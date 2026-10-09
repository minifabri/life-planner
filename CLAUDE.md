# Istruzioni per Claude Code

@AGENTS.md

## Prima di lavorare
- Leggi `docs/product-definition.md` (il *cosa*) e `docs/technical-design.md` (il *come*). Le decisioni [APPROVATO] sono vincolanti; quelle [PROPOSTA] o [DA VERIFICARE] vanno confermate con Bibi.
- Si lavora per incrementi (technical-design.md, sezione 13). Non iniziare un incremento senza il via esplicito.
- Next.js 16.4 con Cache Components: verifica le API nella documentazione in `node_modules/next/dist/docs/` prima di usarle.

## Regole
- Lingua dell'interfaccia e dei testi: italiano.
- Dati: il client parla con Supabase via `lib/supabase/client.ts`; ogni tabella ha RLS con `owner_id = auth.uid()`. Ogni nuova tabella deve avere RLS e le quattro policy, come in `supabase/migrations/20261009140000_init_schema.sql`.
- Migrazioni: un file SQL per modifica in `supabase/migrations/`, poi applicato al progetto `life-planner` (id `hvliluilwazzcphukyjn`). Dopo ogni modifica DDL controlla gli advisor di sicurezza.
- Segreti: mai nel codice né con prefisso `NEXT_PUBLIC_` (tranne URL e chiave publishable di Supabase e chiave VAPID pubblica). I segreti server vivono in Supabase Vault.
- Design: usa i token di `app/globals.css` (design system v0.1). Viola pieno solo per l'azione principale, oro solo per attenzione alta, aree come punto da 6 px.
- Accessibilità: target ≥ 44 px, elementi interattivi reali (`button`, `a`, `input` con `label`), rispetto di `prefers-reduced-motion`.
- Logica complessa (parser, date, ricorrenze, regole pasti) in moduli puri in `lib/` con test Vitest.
- Prima di dichiarare finito: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` verdi, e verifica su iPhone (PWA installata) e desktop.
