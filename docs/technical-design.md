# Personal Life Planner — Technical Design (Fase 4)

> Documento di riferimento tecnico, da usare insieme a `product-definition.md`.
> Stato: **Fase 4 — decisioni T1–T8 approvate il 9 ottobre 2026.** Prossimo passo: avvio della Fase 5 (incremento 0) su conferma esplicita.
> Ultimo aggiornamento: 9 ottobre 2026.

## 0. Come usare questo documento (anche per Claude Code)

- Stati delle decisioni, come nella Product Definition:
  - **[APPROVATO]** deciso con Bibi.
  - **[PROPOSTA]** scelta tecnica raccomandata, da confermare.
  - **[DA VERIFICARE]** fatto non ancora confermato sul campo: va provato con uno spike prima di costruirci sopra.
- Quando questo documento e la Product Definition sembrano in conflitto, vale la Product Definition per il *cosa* e questo documento per il *come*. In caso di dubbio, chiedere.
- Ogni incremento (sezione 13) ha criteri di accettazione. Non dichiarare un incremento completato senza averli verificati su iPhone (PWA installata) e desktop.

---

## 1. Principi tecnici

1. **Proporzionato**: un'app personale per un utente. Niente microservizi, niente code di messaggi, niente backend separato se Supabase e Next.js bastano.
2. **Costo zero** [APPROVATO]: solo piani gratuiti. Ogni scelta deve restare dentro i limiti free (sezione 11).
3. **Il database è la fonte di verità**: Postgres con Row Level Security. Il client parla direttamente con Supabase per i dati; il server Next.js esiste solo per ciò che il browser non può o non deve fare.
4. **Offline mirato** [APPROVATO]: Spesa e Today funzionano senza rete; il resto è online.
5. **Dati portabili**: export completo in formati aperti, backup automatico fuori da Supabase.
6. **Testabile**: la logica difficile (parser, ricorrenze, date, promozione delle attività nel periodo) vive in moduli TypeScript puri con test unitari.

---

## 2. Stack

| Livello | Scelta | Stato | Note |
|---|---|---|---|
| Framework | **Next.js 16.x** (App Router), TypeScript, React 19 | [APPROVATO] Next.js | Ultima stabile al 9 ottobre 2026: 16.4. È annunciato un aggiornamento di sicurezza per il 14 ottobre: partire dalla versione patchata |
| Database, Auth, Storage | **Supabase** (Postgres 15+, Auth, Storage, Cron, Edge Functions) | [APPROVATO] | Piano Free |
| Hosting frontend | **Vercel** Hobby | [APPROVATO] | Uso personale, non commerciale |
| Stile | **Tailwind CSS v4** + CSS custom properties per i token | [PROPOSTA] | I token del design system v0.1 diventano variabili CSS; Tailwind solo come utility |
| Componenti accessibili | **React Aria Components** | [PROPOSTA] | Dialog, menu, date picker, gestione touch/tastiera e focus già accessibili |
| Animazioni | **Motion** (motion.dev) | [PROPOSTA] | Rispetta `prefers-reduced-motion` via `useReducedMotion` |
| Dati lato client | **TanStack Query v5** + **Dexie** (IndexedDB) | [PROPOSTA] | Cache persistente e coda delle modifiche offline (sezione 6) |
| Validazione | **Zod** | [PROPOSTA] | Schemi condivisi client/server |
| Date e fusi | **date-fns v4** + `@date-fns/tz` | [PROPOSTA] | Temporal non ancora utilizzabile ovunque su Safari iOS: rivalutare più avanti |
| Ricorrenze | **rrule** (RFC 5545) | [PROPOSTA] | Stesso formato di Google Calendar |
| PWA | Manifest nativo di Next.js + service worker con **Serwist** | [PROPOSTA] | Serwist è l'opzione indicata dalla guida PWA ufficiale di Next.js per l'offline |
| Web Push | Libreria **web-push** (VAPID) | [PROPOSTA] | Vedi sezione 7 |
| Test | **Vitest** (unitari), **Playwright** (e2e, incluso WebKit mobile) | [PROPOSTA] | |
| Package manager | pnpm | [PROPOSTA] | |

**Alternative scartate**
- *Backend Node/Express separato*: più controllo ma più codice e un servizio in più da ospitare. Supabase copre auth, RLS, cron e funzioni.
- *Motori di sync locale-first (PowerSync, ElectricSQL, Replicache)*: ottimi, ma eccessivi per un solo utente con offline limitato a due sezioni, e aggiungono un servizio e una dipendenza di licenza o di piano.
- *Server Actions per le scritture*: comode, ma falliscono offline. Le scritture dati passano dal client verso Supabase, così la coda offline è una sola.

---

## 3. Architettura

```
 iPhone (PWA installata)            Desktop (browser)
        │                                 │
        ▼                                 ▼
 ┌──────────────────────────────────────────────────┐
 │ Next.js su Vercel                                │
 │  - UI (App Router, client components)            │
 │  - Service worker (Serwist): asset, offline, push│
 │  - Route handler server-only:                    │
 │      /api/link-preview   (metadati wishlist)     │
 │      /api/google/*       (OAuth + sync GCal)     │
 │      /api/push/subscribe (salva subscription)    │
 │      /api/export         (export dati)           │
 └───────────────┬──────────────────────────────────┘
                 │ supabase-js (JWT utente, RLS)
                 ▼
 ┌──────────────────────────────────────────────────┐
 │ Supabase                                         │
 │  - Postgres + RLS (tutte le tabelle)             │
 │  - Auth (OTP via email)                          │
 │  - Cron (pg_cron + pg_net)                       │
 │  - Edge Function "dispatch-reminders" (Web Push) │
 │  - Edge Function "daily-maintenance"             │
 └──────────────────────────────────────────────────┘
                 ▲
 GitHub Actions (backup notturno cifrato) ───────────┘
```

**Chi fa cosa**
- **Client** → CRUD su tutte le tabelle direttamente con supabase-js. Le policy RLS garantiscono che ogni riga sia accessibile solo al proprietario.
- **Route handler Next.js** → solo operazioni che richiedono segreti o accesso di rete lato server: token Google, fetch di pagine esterne, export.
- **Supabase Cron + Edge Functions** → lavori pianificati: invio notifiche ogni minuto, manutenzione giornaliera (ricorrenze, sync GCal, pulizia).
- **Vercel Cron non viene usato per le notifiche**: sul piano Hobby i cron girano al massimo una volta al giorno con precisione di un'ora.

---

## 4. Autenticazione e sicurezza

### 4.1 Login [PROPOSTA]
- **Supabase Auth con codice OTP via email** (6 cifre digitate nell'app), non magic link.
  - Motivo: su iPhone la PWA installata ha uno storage separato da Safari. Un magic link aperto dalla mail si apre in Safari e non autentica l'app installata. Il codice si digita nell'app stessa.
- Sessione lunga con refresh automatico: il login si fa raramente.
- Registrazione chiusa: dopo la creazione dell'account di Bibi, le nuove registrazioni vengono disabilitate nelle impostazioni di Supabase Auth.

### 4.2 Blocco del Personal Log [APPROVATO: Face ID/PIN; PROPOSTA: implementazione]
- **WebAuthn** con autenticatore di piattaforma (Face ID su iPhone, Touch ID/Windows Hello su desktop), `userVerification: "required"`. Si registra una credenziale locale al primo utilizzo; lo sblocco è una verifica locale. **[DA VERIFICARE]** comportamento di WebAuthn nella PWA installata su iOS (spike S2).
- **Fallback PIN** di 4–6 cifre: hash (Argon2id via WebCrypto/wasm o PBKDF2) salvato nel profilo; tentativi limitati con attesa crescente.
- Sblocco valido per la sessione con timeout (proposta: 5 minuti di inattività o app in background).
- **È una protezione dell'interfaccia, non cifratura**: i dati sensibili sono protetti da login, RLS e cifratura a riposo del provider. Va scritto anche nell'app, per onestà.

### 4.3 Titoli neutri [APPROVATO]
- Le notifiche e le viste generali (calendario, ricerca con Log bloccato) usano un titolo neutro per le registrazioni con `is_sensitive = true`. Il testo reale non viene mai inserito nel payload delle notifiche push.

### 4.4 Sicurezza generale
- RLS attiva su **ogni** tabella, con policy `owner_id = auth.uid()`; test automatici che lo verificano.
- Segreti (VAPID privata, client secret Google, service role key) solo nelle variabili d'ambiente server di Vercel e nei secrets/Vault di Supabase. Mai con prefisso `NEXT_PUBLIC_`.
- Token Google in uno schema `private` non esposto dall'API REST, accessibile solo con service role.
- Nessun dato personale in URL, query string o log.
- Header di sicurezza (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) come da guida PWA di Next.js.
- `/api/link-preview` con protezione SSRF (sezione 9.3).

---

## 5. Modello dati (schema Postgres)

> Bozza di schema, da tradurre in migrazioni SQL in Supabase. Convenzioni:
> - `id uuid primary key` generato **dal client** (UUID v7) per permettere la creazione offline.
> - `owner_id uuid not null references auth.users on delete cascade` su ogni tabella.
> - `created_at`, `updated_at timestamptz not null default now()` con trigger su `updated_at`.
> - `deleted_at timestamptz` (soft delete) dove serve per sync e undo; pulizia definitiva dopo 30 giorni.
> - RLS: `select/insert/update/delete using (owner_id = auth.uid())`.

### 5.1 Tabelle

**profiles** (1:1 con l'utente)
```
owner_id (pk), display_name, timezone text default 'Europe/Rome',
theme text check in ('dark','light') default 'dark',
morning_overview_time time default '07:00', evening_review_time time default '20:30',
quiet_start time default '22:00', quiet_end time default '07:30',
meal_prep_reminder_time time default '20:00',
log_lock_pin_hash text null, log_lock_webauthn jsonb null
```

**areas** — aree di vita opzionali
```
id, owner_id, name, color_dark, color_light, sort_order int, archived_at
```

**events** — Evento (non si spunta)
```
id, owner_id, title, notes, location,
start_at timestamptz null, end_at timestamptz null,       -- eventi con orario
all_day boolean default false, start_date date null, end_date date null,
tz text not null default 'Europe/Rome',
rrule text null,                                          -- ricorrenza RFC 5545
area_id uuid null, attention text check in ('low','medium','high') default 'low',
source text check in ('app','gcal','icloud') default 'app',
gcal_calendar_id text null, gcal_event_id text null, gcal_etag text null,
icloud_calendar_id uuid null, icloud_href text null, icloud_etag text null,
deleted_at
unique (owner_id, gcal_calendar_id, gcal_event_id)
```
**event_exceptions** — singole occorrenze spostate o cancellate di un evento ricorrente
```
id, owner_id, event_id, original_start timestamptz, cancelled boolean,
new_start_at timestamptz null, new_end_at timestamptz null
```

**tasks** — Attività (si completa)
```
id, owner_id, title, notes,
date date null, time time null, duration_min int null,    -- pianificazione
due_date date null,                                       -- scadenza / fine finestra
window_start date null,                                   -- inizio finestra "nel periodo"
attention text check in ('low','medium','high') default 'low',
area_id uuid null,
status text check in ('open','done','dismissed') default 'open',
completed_at timestamptz null,
original_date date null,                                  -- per "Rimaste indietro"
recurrence_id uuid null,
source text check in ('manual','recurrence','template','meal') default 'manual',
meal_plan_id uuid null references meal_plans on delete set null,
deleted_at
```
Stati derivati, calcolati nel client da funzioni pure (`lib/tasks/classify.ts`):
- **Agenda**: `date = oggi` e `time` valorizzato.
- **Da fare oggi**: `date = oggi`, senza `time`; oppure attività nel periodo **promossa** (sotto).
- **Nel periodo**: `date is null` e `due_date is not null`.
- **Rimaste indietro**: `status = 'open'` e `date < oggi`; oppure nel periodo con `due_date < oggi`.
- **Promozione** [APPROVATO, D32 della Product Definition]: un'attività nel periodo compare in "Da fare oggi" quando `oggi >= due_date - lead`, con `lead = 1` giorno se la finestra (`due_date - window_start`) è ≤ 7 giorni, `lead = 3` giorni se è più lunga. Se `window_start` è nullo si usa la data di creazione.

**recurrences**
```
id, owner_id, kind text check in ('fixed','after_completion'),
rrule text null,                    -- per 'fixed' (es. FREQ=WEEKLY;BYDAY=MO)
interval_days int null,             -- per 'after_completion' (es. 30)
template jsonb not null,            -- titolo, orario, durata, area, attenzione dell'attività da generare
active boolean default true, until date null
```
Generazione (proposta):
- `fixed`: la manutenzione giornaliera crea le istanze dei prossimi 14 giorni che non esistono ancora.
- `after_completion`: quando un'istanza viene completata, si crea la successiva a `completed_at + interval_days`.
- Un'istanza mancata finisce in "Rimaste indietro" come le altre; la ricorrenza va avanti comunque.

**log_categories**
```
id, owner_id, name, color, is_sensitive boolean default false,
track_last boolean default true, keywords text[] default '{}', sort_order
```
Predefinite all'onboarding: Ciclo (sensibile), Trattamenti (sensibile), Unghie, Parrucchiere, Estetica, Personale.

**log_entries**
```
id, owner_id, category_id, title, notes, date date not null, time time null,
tags text[] default '{}', is_sensitive boolean not null, deleted_at
```
`is_sensitive` è copiato dalla categoria al salvataggio e può essere modificato a mano.

**lists** — contenitore predisposto per la condivisione futura
```
id, owner_id, kind text check in ('shopping','wishlist'), name
```
(La condivisione futura aggiungerà `list_members(list_id, user_id, role)` e policy RLS basate sull'appartenenza.)

**shopping_items**
```
id, owner_id, list_id, name, quantity text null, department text null,
checked boolean default false, checked_at timestamptz null, deleted_at
```

**product_memory** — catalogo appreso, mai gestito a mano
```
id, owner_id, name_normalized text, display_name, department text null,
use_count int default 0, last_used_at timestamptz
unique (owner_id, name_normalized)
```
Aggiornata quando un articolo viene spuntato (`use_count + 1`, `last_used_at = now()`). Punteggio dei suggerimenti: `use_count + max(0, 30 - giorni dall'ultimo uso) / 3` (lo stesso del prototipo, da tarare).

**wishlist_items**
```
id, owner_id, list_id, name, brand null, category text null, url null,
price_amount numeric null, price_currency text null, price_is_estimate boolean default false,
image_url null, notes null, interest smallint check between 1 and 3 default 2,
status text check in ('wanted','bought','discarded') default 'wanted',
source text check in ('manual','link','chatgpt'), metadata_fetched_at timestamptz null, deleted_at
```

**meal_plans** — planner pasti [APPROVATO, MVP]
```
id, owner_id, date date not null,
slot text check in ('breakfast','lunch','snack','dinner'),
name text not null,
prep_mode text check in ('ready','to_prep') not null,
prepared boolean default false, prepared_at timestamptz null,
reminder_task_id uuid null references tasks on delete set null,
unique (owner_id, date, slot)
```

**meal_memory** — pasti ricorrenti, per i suggerimenti
```
id, owner_id, slot, name_normalized, display_name,
default_prep_mode text, use_count int, last_used_at
unique (owner_id, slot, name_normalized)
```

Regole del planner pasti (logica in `lib/meals/`):
- Pasto `to_prep` e non `prepared` → esiste un'attività il giorno prima (`date = pasto.date - 1`, `source = 'meal'`, titolo "Preparare {slot} di domani", note con il nome del piatto).
- Spuntare l'attività → `meal_plans.prepared = true`. Rimettere da fare l'attività → `prepared = false`.
- Segnare "Preparato" dal planner → l'attività collegata diventa `done`.
- Eliminare l'attività → solo il promemoria sparisce (`reminder_task_id = null`); il pasto resta `to_prep`. Non viene ricreata automaticamente.
- Passare il pasto a `ready` o eliminarlo → l'attività collegata viene eliminata.
- Pasti di giorni passati non generano attività.
- La sincronizzazione pasto ↔ attività avviene nella stessa transazione: funzione Postgres `set_meal_prepared` e trigger su `tasks` per i cambi di stato, così resta coerente anche con modifiche fatte offline e sincronizzate dopo.

**templates**
```
id, owner_id, name, items jsonb  -- [{title, day_offset, time, duration_min, area_id, attention}]
```

**reminders** — notifiche pianificate
```
id, owner_id, target_type text check in ('event','task','log_entry','meal_plan','digest'),
target_id uuid null, fire_at timestamptz not null, kind text check in ('auto','custom'),
title_snapshot text, sent_at timestamptz null, attempts int default 0
index on (fire_at) where sent_at is null
```

**push_subscriptions**
```
id, owner_id, endpoint text unique, p256dh text, auth text, user_agent text,
created_at, last_success_at
```

**gcal_calendars**
```
id, owner_id, gcal_calendar_id text, summary, color, selected boolean,
sync_token text null, last_synced_at timestamptz null
```
**icloud_accounts** e **icloud_calendars** (sezione 9.6)
```
icloud_accounts:  owner_id pk, apple_id text, home_url text null, last_synced_at, last_error text null
icloud_calendars: id, owner_id, url text, name, color, selected boolean, ctag text null, last_synced_at
                  unique (owner_id, url)
```
**private.google_tokens** (schema non esposto)
```
owner_id pk, refresh_token text, access_token text, expires_at timestamptz, scopes text[]
```

### 5.2 Fusi orari [APPROVATO nella Product Definition 5.3]
- Eventi con orario: istanti assoluti (`timestamptz`) + `tz`.
- Attività, registrazioni e pasti: `date` e `time` locali, senza fuso.
- "Oggi" e i confini del giorno si calcolano nel `profiles.timezone`.
- Le ricorrenze vengono espanse nel fuso dell'evento, così l'ora legale non sposta gli orari.

### 5.3 Ricerca
- Estensioni `unaccent` e `pg_trgm`.
- Colonna generata `search_text` (titolo + note, normalizzati e senza accenti) con indice GIN trigram su ogni tabella ricercabile.
- Funzione RPC `search_all(q text, types text[], from_date date, to_date date, include_sensitive boolean)` che unisce i risultati di events, tasks, log_entries, shopping_items, wishlist_items, meal_plans e li ordina per similarità e data.
- Tolleranza agli errori: si confronta anche la query senza spazi (`"lent icchie"` → `"lenticchie"`) con `similarity()`.
- `include_sensitive` è `true` solo quando il Log è sbloccato; altrimenti le registrazioni sensibili tornano con titolo neutro.
- Date in linguaggio naturale nella ricerca ("ottobre", "settembre") interpretate dal parser client e trasformate in filtri.

---

## 6. Sincronizzazione e offline

### 6.1 Strategia [APPROVATO: offline per Spesa e Today; PROPOSTA: implementazione]
1. **Lettura**: TanStack Query con persistenza in IndexedDB. All'avvio l'app mostra subito i dati in cache, poi aggiorna in background.
2. **Scrittura ottimistica**: ogni modifica aggiorna subito la cache locale e viene messa in una **outbox** (tabella Dexie) con id, tabella, operazione, payload e timestamp.
3. **Svuotamento della outbox**: in ordine, quando c'è rete. Trigger: avvio dell'app, ritorno in primo piano (`visibilitychange`), evento `online`, timer ogni 30 secondi mentre l'app è aperta.
   - **Non si usa la Background Sync API**: Safari iOS non la supporta, quindi la sync avviene quando l'app viene aperta o torna in primo piano.
4. **Id generati dal client** (UUID v7): un elemento creato offline ha già il suo id definitivo; niente rimappature.
5. **Conflitti**: last-write-wins per riga, usando `updated_at`. Con un solo utente i conflitti reali sono rari (stesso elemento modificato su due dispositivi offline). Caso speciale: spuntare e togliere la spunta su due dispositivi → vince l'ultima azione, accettabile.
6. **Aggiornamento tra dispositivi**: refetch al ritorno in primo piano. Supabase Realtime solo sulla Spesa (utile con telefono e computer aperti insieme), entro il limite free di 200 connessioni.

### 6.2 Cosa funziona offline
| Sezione | Lettura | Scrittura |
|---|---|---|
| Today (oggi, ieri, domani) | ✓ | ✓ completa, rimanda, riprogramma, aggiungi |
| Spesa | ✓ | ✓ aggiungi, spunta, svuota; suggerimenti dalla cache di product_memory |
| Quick Capture | — | ✓ salva nella outbox (il parser gira nel client) |
| Planner pasti | ✓ settimana corrente in cache | ✓ |
| Week, Month, Wishlist, Log, Ricerca | ultima versione in cache, in sola lettura | ✗ con avviso discreto "Serve la connessione" |
| Recupero dati da link | ✗ | ✗ (l'URL viene salvato, i metadati si recuperano dopo) |

Il Log sensibile **non** viene salvato in IndexedDB in chiaro: resta online-only. [PROPOSTA]

### 6.3 Service worker (Serwist)
- Precache della shell dell'app e degli asset statici.
- Strategia network-first per le pagine, fallback alla shell offline.
- Gestione di `push` e `notificationclick` (apre la schermata giusta tramite deep link).

---

## 7. Notifiche

### 7.1 Vincoli verificati
- iPhone: Web Push solo con la PWA **installata nella schermata Home** (iOS 16.4+), permesso richiesto **da un gesto dell'utente** (un pulsante), mai al caricamento della pagina. In Safari normale la Push API non è disponibile.
- Vercel Hobby: cron al massimo una volta al giorno, con precisione di un'ora → inadatto alle notifiche.
- Supabase: `pg_cron` + `pg_net` possono invocare una Edge Function ogni minuto, con i segreti in Vault. **[DA VERIFICARE]** disponibilità di Supabase Cron sul piano Free (spike S3): la pagina prezzi non lo esclude ma non lo cita esplicitamente.

### 7.2 Flusso [PROPOSTA]
1. Quando un elemento viene creato o modificato, il client (o un trigger) calcola le notifiche secondo il livello di attenzione [APPROVATO, Product Definition 5.4]:
   - Bassa: nessuna.
   - Media: una notifica all'orario (o all'orario della morning overview se senza orario).
   - Alta: notifica + richiamo il giorno prima.
   - Fasce di silenzio: le notifiche che cadono dentro vengono spostate alla fine della fascia (tranne le alte, se configurato).
   - Attività dei pasti: notifica all'orario `meal_prep_reminder_time` (proposta 20:00) del giorno prima, se il pasto non è ancora preparato.
   Le righe vanno in `reminders`.
2. **Supabase Cron ogni minuto** → `net.http_post` verso l'Edge Function `dispatch-reminders`.
3. La funzione seleziona i `reminders` con `fire_at <= now()` e `sent_at is null` (max 50 per giro), ricontrolla che il target esista e non sia già completato, invia il push a tutte le subscription dell'utente, segna `sent_at`. In caso di risposta 404/410 elimina la subscription scaduta.
4. Payload: titolo neutro per i contenuti sensibili, deep link alla schermata.

**Rischio e alternativa**: la Edge Function gira su Deno; la libreria `web-push` va importata con `npm:web-push` e la compatibilità va provata (spike S1). Se non funziona, il cron Supabase chiama invece una route Next.js su Vercel (`/api/cron/dispatch`, runtime Node, protetta da un segreto condiviso). Le invocazioni stanno comodamente nei limiti free in entrambi i casi (~43.000 al mese).

### 7.3 Onboarding notifiche
- Su iPhone, se l'app non è installata, una schermata spiega come aggiungerla alla Home (Condividi → Aggiungi alla schermata Home).
- Il permesso si chiede solo da un pulsante esplicito in Impostazioni o al primo promemoria impostato, mai all'avvio.

---

## 8. Quick Capture e parser

- Modulo puro `lib/parser/` (TypeScript), eseguito nel client: funziona offline ed è istantaneo.
- Input: testo + data di riferimento + timezone. Output: `{ kind, title, date, time, durationMin, windowEnd, category, sensitive, confidence, spans }` dove `spans` indica quali parti del testo hanno generato ogni campo (per evidenziarle e correggerle).
- Il prototipo contiene già una prima versione funzionante delle regole (artboard Quick Capture): da riscrivere in TypeScript con test.
- **Test-driven**: una suite di frasi italiane reali (quelle del brief e del prototipo, più quelle che Bibi userà) con il risultato atteso. Ogni bug trovato nell'uso diventa un nuovo caso di test.
- Le parole chiave del Log si leggono da `log_categories.keywords`, così il parser impara categorie nuove senza cambiare codice.
- Fallback AI: [FUTURO], come da Product Definition.

---

## 9. Integrazioni

### 9.1 Google Calendar [APPROVATO: lettura + scrittura dei soli eventi creati nell'app]
- **OAuth 2.0** con un progetto Google Cloud personale. Scope: `calendar.events` (lettura/scrittura eventi) e `calendar.calendarlist.readonly` (elenco calendari).
- **Stato di pubblicazione dell'app OAuth**: in stato "Testing" i refresh token scadono dopo **7 giorni**, quindi l'integrazione smetterebbe di funzionare ogni settimana. Va portata in stato "In production" senza verifica, accettando la schermata "app non verificata" al primo collegamento. **[DA VERIFICARE]** al momento della configurazione che questo sia consentito per gli scope scelti con un solo utente.
- **Sync in lettura** (per ogni calendario selezionato):
  - Prima sync: eventi da 30 giorni fa a 12 mesi avanti con `singleEvents=true` (le ricorrenze arrivano già espanse).
  - Sync successive incrementali con `syncToken`; se Google risponde 410, si rifà la sync completa.
  - Quando: all'apertura dell'app (al massimo ogni 10 minuti) e nella manutenzione giornaliera.
  - Upsert su `events` con `source = 'gcal'` e chiave unica (`gcal_calendar_id`, `gcal_event_id`).
- **Scrittura**: gli eventi creati nell'app vengono inseriti nel calendario predefinito scelto, con `extendedProperties.private.plannerId = events.id`. In lettura, un evento con quella proprietà viene riconosciuto e non duplicato.
- **Proprietà unica**: gli eventi `source = 'gcal'` non si modificano nell'app (pulsante "Apri in Google Calendar"). Gli eventi nati nell'app si modificano nell'app e l'app aggiorna GCal; se vengono modificati in GCal, alla sync successiva vince GCal e l'app mostra le modifiche.
- Notifiche push di Google (canali watch): [FUTURO], la sync su apertura basta per un uso personale.

### 9.2 imayoga [FUTURO]
Da definire quando sapremo quali dati espone. Nel frattempo le lezioni sono eventi ricorrenti (`rrule`).

### 9.3 Recupero dati dai link (wishlist)
- Route handler `/api/link-preview?url=` eseguito su Vercel.
- Lettura in ordine di priorità: JSON-LD `Product` (nome, immagine, `offers.price`, valuta), Open Graph (`og:title`, `og:image`, `product:price:amount`), `<title>`.
- Protezioni: solo `http/https`, risoluzione DNS e blocco di IP privati/locali (anti-SSRF), timeout 5 secondi, massimo 1,5 MB letti, al massimo 3 redirect, user agent dichiarato.
- Campi non trovati restano vuoti, con l'indicazione nell'interfaccia di cosa non è stato recuperato. Mai valori inventati.
- **Limite noto**: Amazon, Zalando, Sephora e Douglas spesso bloccano richieste automatiche o rendono i dati via JavaScript. Ci aspettiamo risultati parziali; vanno misurati su link reali di Bibi (incremento 7).
- Le immagini restano come URL esterni (nessuna copia in Storage nell'MVP).

### 9.4 Import da ChatGPT [APPROVATO: incolla + formato guidato]
- Parser client per righe `Nome | Marca | Categoria | Prezzo | Nota`, con fallback tollerante per elenchi puntati e numerati.
- Prezzi con `~` o "circa" → `price_is_estimate = true`.
- Righe non riconosciute restano nell'anteprima come testo modificabile.

### 9.5 Import da file .ics [APPROVATO il 10 ottobre 2026: import una tantum, prima della sync]
- Da Impostazioni → Dati → Importa da calendario (`/settings/import`). Uno o più file `.ics` (export di Google Calendar, Calendario Apple, Outlook), letti nel browser: nessun dato passa da un server diverso da Supabase.
- Parser puro in `lib/import/ics.ts`: `VEVENT` → evento, `VTODO` aperto → attività. Gestisce giorni interi (fine esclusa), UTC, `TZID` e orari senza fuso (fuso del profilo), `RRULE` (con `UNTIL` riportato al giorno locale), `EXDATE` e occorrenze modificate (`RECURRENCE-ID`) come `event_exceptions`.
- Anteprima prima del salvataggio: periodo "Da oggi in poi" (predefinito) o "Tutto", selezione voce per voce, e passaggio Evento → Attività per le voci non ricorrenti. Le voci non importabili (annullate, completate, senza data) sono elencate con il motivo.
- Gli elementi importati sono dell'app (`source = 'app'`, modificabili). L'id è deterministico dall'UID del file (`ics:<UID>`, `ics-task:<UID>`): reimportare non duplica e un elemento eliminato non viene ricreato.
- **Da tenere presente per la sync Google (9.1)**: l'`iCalUID` di un evento Google coincide con l'UID dell'export. La sync deve riconoscere gli eventi già importati (stesso id deterministico) e collegarli invece di duplicarli, e non deve riscriverli su GCal.
- Limiti noti: la ripetizione dei `VTODO` non viene importata; le occorrenze modificate di una serie mantengono titolo e luogo della serie; i fusi con nome non IANA (alcuni export di Outlook) vengono letti nel fuso del profilo, con avviso nell'anteprima.

### 9.6 Calendario iCloud via CalDAV [APPROVATO il 10 ottobre 2026: sola lettura, in aggiunta a Google]
- **Perché così**: una PWA non può leggere il calendario dell'iPhone (EventKit è riservato alle app native). Gli eventi di Bibi stanno in parte su iCloud e in parte su Google: quelli iCloud si leggono via CalDAV, quelli Google con la sync 9.1.
- **Credenziali**: Apple ID + **password per app** generata da Bibi su account.apple.com (richiede l'autenticazione a due fattori). Inserite una volta in Impostazioni → Calendari → Calendario iCloud (`/settings/icloud`), verificate contro iCloud e custodite in Vault (segreto `icloud:<owner_id>`); il client non le rilegge mai. La password per app si revoca da Apple senza toccare quella dell'account.
- **Edge Function `icloud-caldav`**: porta d'accesso autenticata con il token dell'utente. Azioni: `connect` (verifica e salva le credenziali), `disconnect` (elimina credenziali, calendari ed eventi iCloud), `dav` (inoltra una richiesta aggiungendo le credenziali). Inoltra solo `PROPFIND` e `REPORT`, solo in https verso `caldav.icloud.com` e `pNN-caldav.icloud.com`, senza seguire redirect: la sola lettura è garantita dal server e le credenziali non possono finire altrove.
- **Logica nel client**, in moduli di `lib/icloud/`: `caldav.ts` (puro, con test: costruzione delle richieste, lettura delle risposte multistatus, confronto degli etag) e `sync.ts` (orchestrazione). Il contenuto `.ics` di ogni evento passa dal parser di 9.5 (`lib/import/ics.ts`), senza copie.
- **Scoperta**: `current-user-principal` → `calendar-home-set` (memorizzato in `icloud_accounts.home_url`) → elenco dei calendari di eventi con nome, colore e `ctag`. Bibi sceglie quali seguire; di default nessuno (il calendario di lavoro resta escluso, D10).
- **Sync in lettura** per ogni calendario seguito: se il `ctag` non è cambiato e la sync è già avvenuta oggi non si fa nulla; altrimenti `calendar-query` sugli eventi da 30 giorni fa a 12 mesi avanti, confronto degli `etag` e `calendar-multiget` dei soli eventi cambiati (40 per richiesta).
- **Eliminazioni**: un evento che iCloud non elenca più viene segnato `deleted_at`, tranne quando è semplicemente uscito dal periodo perché passato: in quel caso resta come storico.
- **Quando**: all'apertura dell'app e al ritorno in primo piano (al massimo ogni 10 minuti), più il pulsante "Aggiorna ora". Non c'è sync in background: un evento aggiunto sull'iPhone compare alla successiva apertura dell'app. **[FUTURO]** sync lato server nella manutenzione giornaliera, se servirà per le notifiche.
- **Dati**: `events.source = 'icloud'` con `icloud_calendar_id`, `icloud_href`, `icloud_etag`; tabelle `icloud_accounts` e `icloud_calendars` (RLS e quattro policy). Le ricorrenze restano come `rrule` + `event_exceptions`, come nell'import. Area e attenzione non vengono toccate dalla sync.
- **Proprietà unica**: gli eventi `source = 'icloud'` non si modificano nell'app; si modificano nel Calendario dell'iPhone e la sync successiva porta le modifiche. Nessuna scrittura verso iCloud.
- **Duplicati**: l'id deriva dall'UID (`ics:<UID>`), come nell'import da file: un evento già importato viene collegato alla sync (diventa `source = 'icloud'`, in sola lettura), non duplicato. I promemoria di Apple (`VTODO`) non sono esposti via CalDAV da iOS 13 e restano fuori.
- **[DA VERIFICARE]** con l'account reale: scoperta dei calendari condivisi da altri, comportamento con molti eventi ricorrenti, limiti di frequenza di iCloud.

### 9.7 Cose da fare ed eventi dalle mail [PROPOSTA, non pianificata]
- Richiesta di Bibi del 10 ottobre 2026: leggere le mail e ricavarne attività ed eventi.
- Idea: lettura in sola lettura (Gmail via OAuth `gmail.readonly`, posta iCloud via IMAP con password per app) delle mail recenti della casella principale. Prima fase a regole: inviti `.ics` allegati e conferme strutturate (schema.org: voli, prenotazioni, appuntamenti). Seconda fase con modello AI lato server per le mail scritte a mano (oggi [FUTURO]: il testo delle mail passerebbe da un servizio AI, con costo a consumo).
- Vincolo: nessuna creazione automatica. Le mail producono **proposte** in una lista "Da confermare" con mittente e frase d'origine; Bibi accetta, corregge o scarta.
- Alternativa leggera: un indirizzo a cui inoltrare solo le mail rilevanti, senza accesso alla casella.

---

## 10. Export, backup, eliminazione

- **Export** [APPROVATO: dati esportabili] da Impostazioni → Dati: archivio ZIP con un file JSON per tabella, CSV per Spesa, Wishlist, Log e Pasti, `.ics` per gli eventi creati nell'app. Generato da `/api/export` con il token dell'utente.
- **Backup automatico** [PROPOSTA]: GitHub Action pianificata ogni notte su un repository **privato** di Bibi:
  1. `pg_dump` dello schema `public` con la stringa di connessione salvata nei segreti del repository.
  2. Cifratura del dump con **age** (chiave pubblica nel repository, chiave privata solo in possesso di Bibi).
  3. Commit del file cifrato; conservazione degli ultimi 30 backup.
  Gratuito, fuori da Supabase, e nessun dato sensibile in chiaro su GitHub.
- **Eliminazione account**: cancellazione di tutte le righe (cascade da `auth.users`), delle subscription push e del collegamento Google (revoca del token).

---

## 11. Hosting e costi

| Servizio | Piano | Limiti rilevanti (verificati il 9/10/2026) | Uso previsto |
|---|---|---|---|
| Supabase | Free | 500 MB di database, 5 GB di egress, 1 GB di storage, 500.000 invocazioni di Edge Functions, 200 connessioni Realtime, **massimo 2 progetti attivi**, pausa dopo 1 settimana di inattività, nessun backup scaricabile | Database < 50 MB per anni di uso personale; ~45.000 invocazioni al mese per le notifiche |
| Vercel | Hobby | Uso personale e non commerciale; cron solo giornalieri | Hosting Next.js e route server |
| GitHub | Free | Actions gratuite per repository privati entro la quota mensile | Backup notturno (~1 minuto al giorno) |
| Google Cloud | Gratuito | Calendar API entro le quote gratuite | Sync personale |
| Dominio | Opzionale | Il sottodominio `*.vercel.app` è gratuito | Nessun costo se non serve un dominio proprio |

**Costo mensile previsto: 0 €.**

Note:
- **Pausa del progetto Supabase**: con l'uso quotidiano non dovrebbe verificarsi. **[DA VERIFICARE]** se le chiamate del cron ogni minuto contano come attività. In ogni caso il backup notturno protegge i dati.
- **Due progetti attivi**: se il tuo account Supabase ne ha già uno (ad esempio per imayoga), questo sarebbe il secondo e ultimo progetto gratuito disponibile.

---

## 12. Struttura del repository [PROPOSTA]

```
/app
  (app)/today, /calendar/{day,week,month}, /lists/{shopping,meals,wishlist},
  /log, /settings, /search
  (auth)/login
  api/link-preview, api/google/{connect,callback,sync}, api/push/subscribe, api/export
  manifest.ts
/components            UI riutilizzabile (TaskRow, EventBlock, Sheet, Chip, Segmented…)
/lib
  parser/              Quick Capture (puro, con test)
  dates/               oggi, finestre, fusi
  tasks/               classificazione Today, promozione, riprogrammazione
  recurrence/          generazione istanze
  meals/               regole pasto ↔ attività
  search/
  sync/                outbox, Dexie, persistenza query
  supabase/            client, tipi generati
/styles/tokens.css     token del design system v0.1 (dark/light)
/supabase
  migrations/          SQL versionato
  functions/dispatch-reminders, functions/daily-maintenance
  seed.sql             dati dimostrativi per sviluppo
/tests                 unit (Vitest) ed e2e (Playwright)
/docs                  product-definition.md, technical-design.md
.github/workflows/backup.yml
```

Tipi TypeScript del database generati con `supabase gen types`.

---

## 13. Piano di implementazione (Fase 5)

Ogni incremento si chiude solo dopo la verifica dei criteri su iPhone (PWA installata) e desktop, inclusi stati vuoti, errori e accessibilità.

**Incremento 0 — Fondamenta e spike**
- Progetto Next.js, Supabase (migrazioni, RLS), Vercel, login OTP, PWA installabile, token di design, layout mobile/desktop vuoti.
- Spike da chiudere prima di procedere:
  - **S1** Web Push end-to-end sul tuo iPhone: Cron → Edge Function → notifica ricevuta con app chiusa.
  - **S2** Face ID con WebAuthn nella PWA installata.
  - **S3** Supabase Cron disponibile e funzionante sul piano Free.
  - **S4** Login OTP dentro la PWA installata, con sessione persistente.
- Criteri: app installata sull'iPhone, login funzionante, RLS verificata da test, esito scritto di ogni spike (con eventuale piano B).

**Incremento 1 — Today, attività, eventi**
- CRUD attività ed eventi, Agenda, Da fare oggi, Rimaste indietro con Oggi/Riprogramma, completamento con undo, nel periodo con promozione, ricorrenze di entrambi i tipi.
- Criteri: test unitari di classificazione e promozione; flusso completo dal telefono.

**Incremento 1b — Import da calendario (.ics)** *(aggiunto il 10 ottobre 2026)*
- Import una tantum da file `.ics` con anteprima (sezione 9.5).
- Criteri: suite di test del parser; import di un export reale di Google Calendar dall'iPhone e dal desktop; secondo import dello stesso file senza duplicati.

**Incremento 1c — Google Calendar** *(anticipato dal 12 il 10 ottobre 2026)*
- Sync continua come da sezione 9.1. Richiede prima il progetto Google Cloud con client OAuth creato da Bibi.

**Incremento 1d — Calendario iCloud** *(aggiunto il 10 ottobre 2026)*
- Sync in sola lettura via CalDAV come da sezione 9.6. Richiede prima la password per app creata da Bibi.
- Criteri: test dei moduli puri (lettura delle risposte CalDAV, confronto etag); un evento creato, spostato ed eliminato sull'iPhone compare, si sposta e sparisce nell'app; nessun duplicato con gli eventi già importati da file.

**Incremento 2 — Quick Capture**
- Parser con suite di test, foglio di cattura con chip correggibili, prefissi.
- Criteri: tutte le frasi della suite interpretate correttamente; cattura sotto i 3 secondi per frasi semplici.

**Incremento 3 — Offline per Today e Spesa**
- Persistenza cache, outbox, svuotamento al ritorno in primo piano.
- Criteri: modalità aereo sull'iPhone → modifiche → riattivazione → dati coerenti su desktop.

**Incremento 4 — Spesa**
- Lista con reparti appresi, suggerimenti da product_memory, storico, svuota completati, Realtime.

**Incremento 5 — Planner pasti**
- Settimana, quattro pasti, ricorrenti per pasto, Pronto/Da preparare, attività del giorno prima sincronizzata.
- Criteri: test delle regole pasto ↔ attività, incluse le modifiche fatte offline.

**Incremento 6 — Calendario Week e Month**
- Viste mobile e desktop, drag & drop su desktop, fascia "Periodo".

**Incremento 7 — Personal Log**
- Categorie, timeline, "ultima volta", blocco Face ID/PIN, titoli neutri.

**Incremento 8 — Wishlist**
- Inserimento manuale, recupero da link con test su link reali, import da ChatGPT.

**Incremento 9 — Notifiche**
- Calcolo dei reminder, fasce di silenzio, dispatch, impostazioni.

**Incremento 10 — Ricerca globale e command palette**

**Incremento 11 — Morning overview, Evening review, Templates**

**Incremento 12 — Google Calendar** → anticipato, vedi 1c.

**Incremento 13 — Export, backup automatico, eliminazione account**

L'ordine segue l'uso quotidiano: dopo l'incremento 5 l'app sostituisce già promemoria, liste e spesa.

---

## 14. Decisioni approvate

Tutte le proposte delle sezioni precedenti contrassegnate come [PROPOSTA] e riassunte qui sono state approvate. Restano [DA VERIFICARE] solo i fatti da confermare con gli spike S1–S4.

| # | Decisione | Stato |
|---|---|---|
| T1 | Stile e componenti: Tailwind v4 + token CSS, React Aria Components, Motion | [APPROVATO] |
| T2 | Login: OTP via email (non magic link), registrazioni chiuse dopo il primo account | [APPROVATO] |
| T3 | Offline: TanStack Query + Dexie con outbox, last-write-wins; Log sensibile non salvato offline | [APPROVATO] |
| T4 | Notifiche: Supabase Cron ogni minuto + Edge Function; piano B route su Vercel | [APPROVATO] |
| T5 | Backup: GitHub Action notturna, dump cifrato con age su repository privato, ultimi 30 | [APPROVATO] |
| T6 | Tabelle separate `shopping_items` e `wishlist_items` | [APPROVATO] |
| T7 | Notifica dell'attività di preparazione pasti alle 20:00 del giorno prima, configurabile | [APPROVATO] |
| T8 | Ordine degli incrementi come nella sezione 13 | [APPROVATO] |
| T9 | Import una tantum da `.ics` (1b) e Google Calendar (1c) subito dopo l'incremento 1, prima di Quick Capture | [APPROVATO il 10 ottobre 2026] |

## 15. Ambiente (risposte del 9 ottobre 2026)
- **Supabase**: l'account ha due progetti attivi (`ima-yoga`, `game-night`) e uno in pausa (`playlist-builder`), quindi il limite Free è raggiunto. Decisione: **mettere in pausa `game-night`** all'inizio dell'incremento 0, subito prima di creare il progetto del planner (regione consigliata: `eu-central-1`, come gli altri).
- **Codice**: nuovo **repository privato su GitHub**; il backup va in un secondo repository privato.
- **Indirizzo**: sottodominio gratuito `*.vercel.app`; il nome si sceglie con il nome dell'app (A9 della Product Definition).
- **Esito spike (9 ottobre 2026)**: **S3 superato**, pg_cron gira ogni minuto sul piano Free. **S1 lato server superato**: la Edge Function con `npm:web-push` gira su Deno e consegna richieste firmate al servizio push di Apple; resta da confermare la ricezione sul tuo iPhone. S2 e S4 da provare sul dispositivo.
- **Deploy**: Vercel `life-planner`, produzione su `life-planner-theta-mocha.vercel.app` (alias `life-planner-blastafb-5752.vercel.app`). Supabase `life-planner`, id `hvliluilwazzcphukyjn`; `game-night` messo in pausa.
- **Browser desktop**: **Chrome**. I test e2e coprono Chromium (desktop) e WebKit (iPhone); notifiche e WebAuthn si verificano anche a mano su Chrome e sulla PWA installata.

---

## Fonti consultate
- [Supabase — Pricing](https://supabase.com/pricing)
- [Supabase — Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Vercel — Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Next.js — Blog (16.4, aggiornamento di sicurezza del 14 ottobre)](https://nextjs.org/blog)
- [Next.js — Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Pushpad — iOS special requirements for web push](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [Google — Using OAuth 2.0 to Access Google APIs](https://developers.google.com/identity/protocols/oauth2)
