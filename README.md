# Planner

Web app personale (PWA) per organizzare la giornata: attività, appuntamenti, spesa, pasti, wishlist e Personal Log.
Documentazione di prodotto e tecnica in [`docs/`](docs/).

## Stack
Next.js 16 (App Router, Cache Components) · React 19 · Tailwind CSS v4 · Supabase (Postgres + RLS, Auth OTP, Cron, Edge Functions) · Vercel.

## Avvio in locale
```bash
pnpm install
cp .env.example .env.local   # valori in Supabase → Project Settings → API
pnpm dev
```

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | Server di sviluppo |
| `pnpm build` | Build di produzione |
| `pnpm test` | Test unitari (Vitest) |
| `pnpm typecheck` | Tipi di route + TypeScript |
| `pnpm lint` | ESLint |

## Struttura
```
app/(auth)/login        Login con codice OTP via email
app/(app)/...           Sezioni dell'app (protette dal login)
app/icons/[file]        Icone PWA generate in build
app/manifest.ts         Manifest della PWA
public/sw.js            Service worker (push; cache offline dall'incremento 3)
components/             UI condivisa (shell, icone, intestazioni)
lib/                    Logica pura e client (date, push, blocco, supabase)
supabase/migrations     Schema SQL versionato
supabase/functions      Edge Functions (dispatch-reminders)
supabase/tests          Verifiche SQL (RLS)
docs/                   Product definition e technical design
```

## Infrastruttura
- **Supabase**: progetto `life-planner` (eu-central-1). Segreti in Vault: `project_url`, `cron_secret`, `vapid_public_key`, `vapid_private_key`, `vapid_subject`.
- **Cron**: job `dispatch-reminders` ogni minuto → Edge Function omonima → Web Push.
- **Vercel**: progetto `life-planner`, produzione su `life-planner-theta-mocha.vercel.app`.

## Stato
Incremento 0 (fondamenta e spike) — vedi `docs/technical-design.md`, sezione 13.
