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
notify_medium bool default true, notify_high bool default true, quiet_allow_high bool default false,
notify_meal_prep bool default true, notify_morning bool default false, notify_evening bool default false,
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
source text check in ('app','gcal','icloud','imayoga') default 'app',
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
Implementazione (incremento 4): la aggiorna il trigger `shopping_items_learn` nella stessa transazione dell'articolo (migrazione `20261010110000_shopping_memory.sql`, verifica in `supabase/tests/shopping_memory_check.sql`), così resta coerente anche con le modifiche sincronizzate dalla outbox.
- Nuovo articolo senza reparto → eredita quello imparato per lo stesso nome (`normalize_product_name`: minuscolo, senza accenti).
- Nome o reparto modificati → il catalogo impara il nuovo reparto (anche "nessuno").
- Spunta → `use_count + 1` e `last_used_at = checked_at`; spunta tolta → `use_count - 1`. "Svuota completati" è un soft delete e non tocca il catalogo.
- I suggerimenti mostrano solo prodotti comprati almeno una volta (`use_count > 0`), per non riproporre errori di battitura.

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
- La sincronizzazione pasto ↔ attività avviene nella stessa transazione, con due trigger (`tasks_sync_meal`, `meal_plans_sync_task`), così resta coerente anche con modifiche fatte offline e sincronizzate dopo.

Come è stato realizzato (incremento 5, 10 ottobre 2026):
- Le regole vivono due volte, volutamente: in `lib/meals/rules.ts` (funzioni pure che producono le operazioni per la outbox, così l'interfaccia si aggiorna subito e funziona senza rete) e nei trigger del database (che garantiscono la coerenza qualunque cosa arrivi). Le due versioni sono idempotenti: applicarle entrambe dà lo stesso risultato. I trigger hanno preso il posto della funzione `set_meal_prepared` prevista all'inizio. Verifica dei trigger: `supabase/tests/meal_sync_check.sql`.
- "Giorni passati" include oggi: un pasto di oggi da preparare non crea un'attività per ieri. Si spunta **Preparato** direttamente dal planner.
- Togliere **Preparato** dal planner rimette da fare l'attività collegata, se esiste ancora.
- Tornare da Pronto a Da preparare crea una nuova attività (è una scelta esplicita); dopo aver eliminato l'attività a mano, invece, niente la ricrea.
- Cambiare il piatto aggiorna le note dell'attività collegata. In Today il piatto compare sotto il titolo dell'attività.
- `meal_memory`: una riga per momento e nome normalizzato, con id deterministico; a ogni pasto aggiunto o rinominato `use_count + 1` e la modalità scelta diventa quella abituale.
- Offline: la settimana corrente e i ricorrenti vengono scaricati a ogni apertura; le altre settimane solo se già visitate.

**templates**
```
id, owner_id, name, items jsonb  -- [{title, day_offset, time, duration_min, area_id, attention}]
```

**reminders** — notifiche pianificate
```
id, owner_id, target_type text check in ('event','task','log_entry','meal_plan','digest'),
target_id uuid null, fire_at timestamptz not null, kind text check in ('auto','custom'),
title_snapshot text, sent_at timestamptz null, attempts int default 0,
dedupe_key text null  -- unica per (owner_id, dedupe_key)
index on (fire_at) where sent_at is null
```
Dall'incremento 9 è il registro degli invii e la coda dei tentativi, non un elenco pianificato in anticipo (sezione 7.4).

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
5. **Conflitti**: vince l'ultima modifica che arriva al server, campo per campo (vedi 6.4; la proposta iniziale era last-write-wins per riga con `updated_at`). Con un solo utente i conflitti reali sono rari (stesso elemento modificato su due dispositivi offline). Caso speciale: spuntare e togliere la spunta su due dispositivi → vince l'ultima azione, accettabile.
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

### 6.4 Come è stato realizzato (incremento 3, 10 ottobre 2026)
- **Modifiche come dati** (`lib/sync/ops.ts`, puro e testato): ogni scrittura è un'operazione `insert` / `update` / `delete` su una tabella. La stessa descrizione serve a inviarla a Supabase e ad applicarla ai dati in cache. Gli inserimenti partono come upsert che ignora i doppioni: rimandare una modifica la cui risposta è andata persa non crea nulla due volte.
- **Outbox** (`lib/sync/outbox.ts`, Dexie, database `planner`): le modifiche si inviano una alla volta, in ordine. Senza rete, con errori 5xx o con la sessione da rinnovare (401) l'invio si ferma e riprova al giro successivo; un rifiuto vero del server (4xx) scarta la modifica, avvisa con un toast e rilegge i dati.
- **Cache** (`lib/sync/engine.ts`): il risultato di ogni lettura è "dati del server + modifiche ancora in attesa", quindi un refetch non cancella ciò che non è ancora partito. La cache di TanStack Query è salvata in IndexedDB (7 giorni) per profilo, aree, categorie, liste, ricorrenze, attività, eventi, lista della spesa e catalogo dei prodotti. Il Log non viene salvato.
- **Giorni disponibili offline**: oggi, ieri e domani vengono scaricati a ogni apertura; gli altri giorni solo se già visitati.
- **Conflitti**: vince l'ultima modifica che arriva al server, campo per campo (le azioni rapide inviano solo i campi cambiati). Non si confronta `updated_at`: con un confronto per riga, completare un'attività offline verrebbe annullato da una modifica al titolo fatta più tardi su un altro dispositivo. **[APPROVATO il 10 ottobre 2026]**: sostituisce il confronto su `updated_at` del punto 5 della 6.1.
- **Ricorrenze**: la prossima attività "N giorni dopo" nasce offline insieme al completamento (id deterministico). Le occorrenze a calendario fisso si creano solo con la rete: a ogni apertura, al cambio di giorno e dopo ogni invio riuscito.
- **Registrazioni riservate del Log**: non passano dalla outbox (che è in chiaro sul dispositivo). Dal Quick Capture senza rete l'app risponde "Per questa registrazione serve la connessione".
- **Uscita dall'account**: si prova a inviare ciò che è in attesa, poi la cache salvata viene cancellata. Le modifiche non inviate restano nella outbox, legate all'utente, e partono al prossimo accesso.
- **Service worker**: sorgente in `app/sw.ts`, compilato in build da `@serwist/turbopack` e servito come file statico su `/serwist/sw.js` con scope `/` (stessa registrazione del vecchio `/sw.js`, quindi l'iscrizione push resta valida). Precache di script, stili, font e delle schermate; le richieste verso Supabase non passano dal service worker. Un nuovo deploy si vede alla seconda apertura dell'app.
- **Avviso di stato**: una riga discreta in alto, solo quando serve ("Sei offline", "N modifiche in attesa").

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

### 7.4 Come è stato realizzato (incremento 9, 10 ottobre 2026)
- **Scostamento dal punto 1 del flusso [APPROVATO il 10 ottobre 2026]**: le notifiche non vengono scritte in anticipo dal client. A ogni giro del cron la Edge Function `dispatch-reminders` le ricava dallo stato reale di attività ed eventi per gli ultimi 10 minuti, le registra in `reminders` con una chiave (`dedupe_key`) e invia ciò che è in attesa. Così le serie di eventi notificano senza aprire l'app, e ciò che è completato, spostato o eliminato non notifica: non c'è nulla da tenere allineato.
- **Regole** in `lib/reminders/plan.ts` (puro, con test):
  - Media: all'orario; senza orario all'ora del mattino (`morning_overview_time`). Le attività "nel periodo" avvisano nell'ultimo giorno utile.
  - Alta: in più il richiamo del giorno prima, alla stessa ora locale; senza orario all'ora della revisione serale.
  - Eventi: all'inizio (quelli di tutto il giorno al mattino); le serie rispettano eccezioni e cambio dell'ora.
  - Pasti: l'attività "Preparare … di domani" avvisa a `meal_prep_reminder_time` se è ancora aperta, qualunque sia l'attenzione.
  - Silenzio: l'invio slitta alla fine della fascia e il testo si adegua ("Ieri alle 23:00"); le alte la attraversano solo con `quiet_allow_high`. Un elemento con orario dentro la fascia viene quindi avvisato dopo il suo orario.
  - Panoramica del mattino e revisione della sera: facoltative, spente in partenza; la sera solo se resta qualcosa di aperto.
  - Un elemento creato o modificato dopo l'orario previsto non manda l'avviso in ritardo. Spostato a un altro orario, avvisa di nuovo (la chiave contiene data e ora).
- **Stesso codice in produzione e nei test**: `pnpm build:functions` impacchetta il modulo in `supabase/functions/dispatch-reminders/plan.gen.js` (le librerie restano fuori, Deno le prende da npm alle versioni di `package.json`); `pnpm test` fallisce se il file non è aggiornato. Dopo una modifica alle regole la funzione va ripubblicata.
- **Prova senza invii**: chiamata con `{"dryRun": true, "at": "<istante>", "minutes": <n>}` la funzione risponde con ciò che registrerebbe.
- Il registro più vecchio di 30 giorni viene tolto una volta al giorno.
- **Impostazioni → Notifiche**: attivazione per dispositivo; preferenze (livelli, pasti, mattino, sera, orari, silenzio) valide per tutti i dispositivi, salvate solo con la rete.
- Non incluso: notifiche dal Personal Log (le registrazioni non hanno un livello di attenzione, quindi la regola dei titoli neutri oggi non ha casi); anticipo configurabile per gli eventi; apertura diretta dell'elemento dalla notifica (si apre Oggi).

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

### 9.2 imayoga [APPROVATO il 10 ottobre 2026: sola lettura, solo lezioni pubblicate, accesso con token]
- **Cosa espone** il progetto Supabase `ima-yoga` (id `fmlndlnpooyrvnzhmota`): `classes` (data, ora di inizio, tipo, livello, `published`, `is_individual`, `personal_client_id`), `bookings` (stato `booked` o `waitlist`), `events` (nome, data, ora, luogo, `published`, `archived`). Le lezioni non hanno né durata né luogo.
- **Regole (D11)**:
  - solo lezioni con `published = true`; le bozze non entrano;
  - durata **60 minuti** (`end_at = start_at + 60 min`); gli orari sono sempre italiani (`Europe/Rome`), qualunque sia il fuso del profilo;
  - lezioni individuali solo se prenotate (almeno un `booked`) o assegnate a un'allieva (`personal_client_id`); gli slot vuoti restano fuori;
  - entrano anche gli eventi pubblicati e non archiviati, con il loro luogo e la stessa durata;
  - sola lettura: nessuna scrittura verso imayoga.
- **Su ima-yoga**: funzione `planner_feed(p_token, p_from, p_to)` (security definer, eseguibile da `anon`) che restituisce lezioni ed eventi pubblicati con `is_individual`, numero di prenotati e `assigned`. Il token si confronta con l'impronta SHA-256 conservata in `planner_feed_tokens` (RLS, solo admin); un token sbagliato dà errore (403), non un elenco vuoto. La funzione pubblica `public_calendar_preview` non bastava: non dice se una lezione è individuale né se è prenotata. Copia della migrazione in `supabase/external/ima-yoga_planner_feed.sql` (il repository di imayoga non ha una cartella di migrazioni).
- **Segreto**: `imayoga:<owner_id>` in Vault del planner, con indirizzo, chiave publishable di imayoga e token. È **per utente**: solo l'account che ha il segreto riceve le lezioni; gli altri account del planner ottengono `not_configured`. Creato a mano via SQL per l'account di Bibi; il token è stato generato dentro il database e non compare in nessun file. Per revocarlo basta eliminare la riga di `planner_feed_tokens`.
- **Edge Function `imayoga-feed`** (JWT verificato nel codice, come `icloud-caldav`): autentica l'utente, legge il segreto con `imayoga_get_feed_config` (solo service role) e fa una sola chiamata https a `planner_feed` su `*.supabase.co`, senza seguire redirect. Risponde `{ ok, items }` oppure `not_configured`, `invalid_token`, `imayoga_unreachable`.
- **Logica nel client**, in `lib/imayoga/`: `map.ts` (puro, con test: riga del feed → evento, filtro degli slot individuali vuoti, titoli, durata e fuso, piano di sync) e `sync.ts` (orchestrazione), più `hooks.ts`.
- **Dati**: `events.source = 'imayoga'`; l'id dell'evento deriva da quello della lezione (`imayoga:class:<id>`, `imayoga:event:<id>`), quindi non servono colonne in più e una seconda sync non duplica. Tabella `imayoga_accounts` (RLS e quattro policy): la riga dice che le lezioni sono seguite e tiene `last_synced_at` e `last_error`.
- **Titoli**: "Tipo · Livello" (es. "Ashtanga · Intermedio"); per le individuali "Lezione individuale", senza il nome dell'allieva. Area "Insegnamento yoga" alla creazione; area e attenzione non vengono poi toccate dalla sync.
- **Sync**: periodo da 30 giorni fa a 12 mesi avanti; all'apertura dell'app e al ritorno in primo piano (al massimo ogni 10 minuti), più "Aggiorna ora" in Impostazioni → Lezioni imayoga. Si scrive solo ciò che è cambiato. Una lezione che il feed non elenca più (eliminata, tolta dalla pubblicazione, individuale rimasta senza prenotazioni) viene segnata `deleted_at`, tranne quando è solo uscita dal periodo perché passata; se torna nel feed, torna anche nell'app.
- **Scollega**: gli eventi `source = 'imayoga'` vengono segnati `deleted_at` e la riga di `imayoga_accounts` eliminata; il segreto resta, quindi si può ricollegare.
- **Proprietà unica**: gli eventi `source = 'imayoga'` non si modificano nell'app.
- **[FUTURO]** numero di prenotati nel dettaglio dell'evento; sync lato server, se servirà per le notifiche.

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

**Incremento 1e — Lezioni da imayoga** *(aggiunto il 10 ottobre 2026)*
- Sync in sola lettura come da sezione 9.2. Realizzato il 10 ottobre 2026: migrazione su `ima-yoga`, migrazione `imayoga_feed`, Edge Function `imayoga-feed`, `lib/imayoga/`, sezione in Impostazioni.
- Criteri: test dei moduli puri (mappatura, filtro degli slot individuali vuoti, durata e fuso, eliminazioni); le lezioni pubblicate compaiono nell'app con l'orario giusto; una bozza non compare e compare dopo la pubblicazione; uno slot individuale compare solo dopo una prenotazione; seconda sync senza duplicati.

**Incremento 2 — Quick Capture**
- Parser con suite di test, foglio di cattura con chip correggibili, prefissi.
- Criteri: tutte le frasi della suite interpretate correttamente; cattura sotto i 3 secondi per frasi semplici.

**Incremento 3 — Offline per Today e Spesa**
- Persistenza cache, outbox, svuotamento al ritorno in primo piano (realizzazione: sezione 6.4). Funzionano offline Today, il Quick Capture e la Spesa (aggiungi, spunta, modifica, svuota; il catalogo dei prodotti lo aggiorna il database alla sincronizzazione).
- Criteri: modalità aereo sull'iPhone → modifiche → riattivazione → dati coerenti su desktop.

**Incremento 4 — Spesa**
- Lista con reparti appresi, suggerimenti da product_memory, storico, svuota completati, Realtime.
- Realizzato il 10 ottobre 2026 sul livello dati online: l'aggancio alla outbox arriva con l'unione dell'incremento 3 (le scritture della Spesa sono tutte in `lib/data/shopping.ts`).
- Reparti proposti, in ordine di lista: Frutta e verdura, Frigo, Pane e forno, Dispensa, Surgelati, Bevande, Casa, Cura della persona; senza reparto → "Altro". Il dizionario iniziale prodotto → reparto resta [PROPOSTA] e non è incluso.
- La quantità si può scrivere insieme al nome ("2 latte", "latte x2", "500 g farina"), anche dal Quick Capture (`lib/shopping/entry.ts`).
- Criteri: test di `lib/shopping`; verifica SQL del catalogo; dal telefono: aggiungi, assegna un reparto, spunta, svuota, riaggiungi dallo storico e ritrova il reparto; con telefono e computer aperti insieme la lista si aggiorna da sola.

**Incremento 5 — Planner pasti**
- Settimana, quattro pasti, ricorrenti per pasto, Pronto/Da preparare, attività del giorno prima sincronizzata. Realizzazione: fine della sezione 5.1. La notifica delle 20:00 arriva con l'incremento 9.
- Criteri: test delle regole pasto ↔ attività, incluse le modifiche fatte offline.

**Incremento 6 — Calendario Week e Month**
- Viste mobile e desktop, drag & drop su desktop, fascia "Periodo".
- Come è stato realizzato (10 ottobre 2026):
  - Logica pura in `lib/calendar/view.ts` (griglia del mese, contenuto e carico di ogni giorno, elementi principali, segni del mese, fascia Periodo, spostamento di un evento, corsie dei blocchi sovrapposti), con test.
  - Dati: le query di attività ed eventi accettano un intervallo di giorni (`["tasks", dal, al]`, `["events", dal, al]`) e passano dalla stessa cache e dalla stessa outbox di Today: settimane e mesi già aperti si rivedono offline e le modifiche fatte lì restano in coda come le altre.
  - **Settimana, mobile**: elenco dei sette giorni con barra di carico e fino a tre elementi; il tocco apre il Giorno. Per spostare un elemento si apre e si cambia la data.
  - **Settimana, desktop**: sette colonne con attività senza orario in testa e blocchi posizionati sull'orario (8–20, allargato a ciò che c'è). Si trascinano tra i giorni le attività e gli eventi nati nell'app e non ricorrenti; serie ed eventi di Google o iCloud restano fermi. Un evento spostato mantiene ora locale e durata.
  - **Fascia Periodo** (D33): attività nel periodo ancora aperte la cui finestra tocca la settimana; trascinate su un giorno prendono quella data. Nell'ultimo giorno utile compaiono anche nella colonna, con il segno di scadenza.
  - **Mese**: solo segni nelle celle (evento, attività, scadenza, importante) con legenda; un tocco mostra l'anteprima del giorno sotto la griglia, il doppio tocco o "Apri il giorno" apre il Giorno. I segni del Log arrivano con l'incremento 7.
  - Il giorno scelto passa alla vista Giorno in memoria (`lib/nav/day-handoff.ts`), non nell'URL.
  - Non incluso: trascinamento verticale per cambiare orario; filtro "Senza data" (ancora [PROPOSTA] nella Product Definition 6).

**Incremento 7 — Personal Log**
- Categorie, timeline, "ultima volta", blocco Face ID/PIN, titoli neutri.
- Come è stato realizzato (10 ottobre 2026):
  - Logica pura con test: `lib/log/timeline.ts` (cronologia, filtri, gruppi per mese, "ultima volta", tag, giorni con registrazioni), `lib/lock/pin.ts` (hash e verifica del PIN, attese dopo gli errori). Stato dello sblocco in `lib/lock/session.ts`.
  - **Riservate, a Log bloccato**: dal server si chiedono solo `id` e `date`. Titolo, note, tag e categoria non arrivano al dispositivo; in cronologia compare "Registrazione riservata" e le categorie riservate non mostrano l'"ultima volta". Cercando o filtrando, i segnaposto spariscono (non si può sapere se corrispondono).
  - **Riservate, a Log sbloccato**: il contenuto sta solo in memoria e viene tolto al blocco. Non entra nella cache salvata né nella outbox: per scriverle serve la connessione.
  - **Non riservate**: passano dalla outbox come le altre modifiche e restano in cache sul dispositivo (lettura e scrittura offline).
  - **PIN** (4–6 cifre): hash PBKDF2-SHA-256 con sale casuale e 210.000 iterazioni in `profiles.log_lock_pin_hash`; vale su tutti i dispositivi. Dopo tre errori si aspetta 30 secondi, poi il doppio a ogni errore, fino a 15 minuti (conteggio sul dispositivo).
  - **Face ID / Touch ID**: facoltativo, per dispositivo, in aggiunta al PIN (WebAuthn, credenziale locale come nello spike S2).
  - **Scadenza dello sblocco**: 5 minuti senza attività, oppure app in secondo piano per più di un minuto (non subito: la finestra di Face ID manda l'app in secondo piano per qualche secondo). Ricaricando l'app il Log torna bloccato; anche all'uscita dall'account.
  - **Categorie**: creazione, modifica (nome, colore, riservata, "ultima volta", parole per il Quick Capture) ed eliminazione dalla vista Categorie, solo con la rete. Rendere riservata una categoria vale per le registrazioni nuove.
  - **Mese**: un trattino neutro nei giorni con almeno una registrazione, riservata o no (D24).
  - Si tengono in vista le ultime 2.000 registrazioni per tipo.
  - Non incluso: sezione "Da ricordare" di Today con i segni del Log; titoli neutri in notifiche (incremento 9) e ricerca globale (incremento 10).

**Incremento 8 — Wishlist**
- Inserimento manuale, recupero da link con test su link reali, import da ChatGPT.

**Incremento 9 — Notifiche**
- Calcolo dei reminder, fasce di silenzio, dispatch, impostazioni. Realizzazione: sezione 7.4.
- Criteri: test di `lib/reminders`; prova a secco della funzione; dal telefono: attività ad attenzione media con orario tra pochi minuti → notifica con app chiusa; la stessa completata prima dell'orario → nessuna notifica.

**Incremento 10 — Ricerca globale e command palette**

**Incremento 11 — Morning overview, Evening review, Templates**
- Morning overview ed Evening review anticipate il 10 ottobre 2026 (i Templates restano da fare):
  - Logica pura con test in `lib/today/overview.ts` (quale card mostrare, saluto, frase di sintesi, prossima scadenza); card in `components/today/overview-card.tsx`.
  - **Mattino**: frase del prototipo ("Buongiorno, Bibi. Oggi 3 appuntamenti e 8 attività; una scade oggi.") con carico, rimaste indietro e, a parte, la scadenza più vicina dei prossimi sei giorni. Resta fino all'ora della review o alla chiusura.
  - **Sera**: dall'ora di `profiles.evening_review_time` (20:30), le attività di oggi ancora aperte con Completa · Domani · Scegli data; ciò che si lascia finisce tra le rimaste indietro.
  - La chiusura vale per il giorno e per il dispositivo (`localStorage`), non è sincronizzata.
  - Impostazioni → "Mattino e sera": nome usato nel saluto (`display_name`) e ora della review, solo con la rete.
  - Non incluso: notifica facoltativa che accompagna le card (incremento 9); `morning_overview_time` resta inutilizzato fino ad allora.

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
| T10 | imayoga (1e): sola lettura, solo lezioni pubblicate, 60 minuti, individuali solo se prenotate; accesso con funzione protetta da token su `ima-yoga` (sezione 9.2) | [APPROVATO il 10 ottobre 2026] |

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
