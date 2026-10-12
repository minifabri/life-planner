# Personal Life Planner — Product Definition

> Documento di riferimento per la progettazione e lo sviluppo. Il *come* tecnico è in `technical-design.md`.
> Stato: **Fase 2 approvata, Fase 3 completata** (prototipo navigabile e design system v0.1 approvati). Fase 4 (Technical Design) in revisione.
> Ultimo aggiornamento: 9 ottobre 2026.

## 0. Come usare questo documento (anche per Claude Code)

- Ogni decisione è marcata con uno stato:
  - **[APPROVATO]** discusso e confermato in discovery.
  - **[PROPOSTA]** suggerito dal team di design, **non ancora approvato**. Non implementare senza conferma.
  - **[FUTURO]** fuori dall'MVP, da rivalutare.
- **Non implementare nulla prima dell'approvazione esplicita delle Fasi 3 e 4.**
- Lo sviluppo procede per incrementi verificabili (sezione 9). Ogni incremento va verificato su mobile (iPhone, PWA installata) e desktop, inclusi stati vuoti, errori e accessibilità. Non dichiarare funzionante ciò che non è stato verificato.
- In caso di conflitto tra questo documento e un'ipotesi non scritta, vale il documento. In caso di ambiguità, chiedere.

---

## 1. Visione

Un'unica app personale, mobile-first ed eccellente anche su desktop, che sostituisce calendario, liste della spesa, appunti, promemoria sparsi e liste di desideri.

Il centro dell'esperienza è **Today**: aprendo l'app al mattino si capisce subito cosa aspetta la giornata. Aggiungere qualcosa richiede **tre secondi**. L'app aiuta a ricordare senza aumentare la pressione: non tutto è un task, non tutto notifica, niente sensi di colpa per ciò che resta indietro.

### Principi (dal brief, vincolanti)
1. Capture first. 2. Today first. 3. Progressive disclosure. 4. Low cognitive load. 5. Consistency.
6. Personal, not corporate. 7. Calm technology. 8. Fast by default. 9. Data ownership. 10. Useful sophistication.

---

## 2. Registro delle decisioni

### Modello degli elementi
| # | Decisione | Stato |
|---|---|---|
| D1 | Quattro tipi base: **Evento**, **Attività**, **Registrazione**, **Articolo** | [APPROVATO] |
| D2 | "Promemoria" non è un tipo: è una **notifica** applicabile a qualsiasi elemento datato | [APPROVATO] |
| D3 | "Scadenza" è una **data limite** di un'Attività, non un tipo | [APPROVATO] |
| D4 | Le Attività possono avere **orario** e **durata** opzionali (es. pratica yoga 17:00, 45 min) e si spuntano | [APPROVATO] |
| D5 | Le attività non completate **non slittano** da sole: compaiono in "Rimaste indietro" su Today | [APPROVATO] |

### Utenti e piattaforma
| # | Decisione | Stato |
|---|---|---|
| D6 | Utente singolo; schema predisposto per condividere liste in futuro | [APPROVATO] |
| D7 | Dispositivo principale: **iPhone**, app usata come **PWA installata** nella schermata Home | [APPROVATO] |
| D8 | Offline: **Lista spesa e Today** consultabili e modificabili offline; resto online | [APPROVATO] |

### Integrazioni
| # | Decisione | Stato |
|---|---|---|
| D9 | Google Calendar **personale**: lettura degli eventi + scrittura su GCal solo degli eventi creati nell'app (un solo "proprietario" per evento) | [APPROVATO] |
| D10 | Calendario di lavoro: **escluso** dall'integrazione | [APPROVATO] |
| D11 | Lezioni yoga: lette da **imayoga** in sola lettura. Solo le lezioni **pubblicate** (niente bozze), durata predefinita **un'ora**, lezioni individuali **solo se prenotate** | [APPROVATO il 10 ottobre 2026] |

### Privacy
| # | Decisione | Stato |
|---|---|---|
| D12 | Protezione "standard + blocco": login, cifratura a riposo del provider, **Face ID/PIN** per aprire il Log, **titoli neutri** per le categorie sensibili in notifiche e viste generali | [APPROVATO] |

### Quick Capture
| # | Decisione | Stato |
|---|---|---|
| D13 | Interpretazione del linguaggio naturale con **parser a regole locale in italiano** nell'MVP | [APPROVATO] |
| D14 | Fallback AI esterno: rimandato, da valutare dopo l'uso reale | [FUTURO] |

### Tecnologia e costi
| # | Decisione | Stato |
|---|---|---|
| D15 | Frontend **Next.js (React)** | [APPROVATO] |
| D16 | **Supabase** (Postgres, Auth, Storage) + **Vercel** | [APPROVATO] |
| D17 | Budget: **solo piani gratuiti** | [APPROVATO] |
| D18 | Backup: export automatico schedulato verso una destinazione dell'utente (il free tier Supabase non offre backup scaricabili) | [PROPOSTA] — dettagli in Fase 4 |

### Sezioni
| # | Decisione | Stato |
|---|---|---|
| D19 | Spesa raggruppata **per reparto**, reparto appreso dall'uso, categorie mai obbligatorie | [APPROVATO] |
| D20 | Spesa: nessun articolo ricorrente automatico; solo **suggerimenti** per frequenza e recenza | [APPROVATO] |
| D21 | Wishlist: import da ChatGPT con **incolla + formato guidato** | [APPROVATO] |
| D22 | Wishlist: recupero dati dai link "best effort", da testare su Amazon, siti beauty (Sephora, Douglas), moda (Zalando, brand). Campi non recuperabili restano vuoti, mai inventati | [APPROVATO] |
| D23 | Log: per gli eventi che si ripetono mostrare solo **"ultima volta"** (es. "Unghie — 18 giorni fa"). Nessuna media, previsione o interpretazione | [APPROVATO] |
| D24 | Log nel calendario: solo **segno discreto** nel giorno; contenuto visibile aprendo il Log | [APPROVATO] |
| D25 | Notifiche **per livello di attenzione** (vedi 5.4) | [APPROVATO] |
| D26 | Nell'MVP: **Morning overview**, **Evening review**, **Templates** | [APPROVATO] |
| D27 | Smart rescheduling | [FUTURO] |
| D28 | Tema principale **dark**; light disponibile e selezionabile | [APPROVATO] |

### Decisioni della Fase 3 (prototipo)
| # | Decisione | Stato |
|---|---|---|
| D29 | Prototipo e **design system v0.1** (palette, tipografia Geist/Geist Mono, componenti, movimento) come base visiva | [APPROVATO] |
| D30 | "Rimaste indietro": azioni **Oggi** e **Riprogramma**. Riprogramma apre una modale con date rapide (domani, lunedì, fra una settimana), **data a scelta** e **Scarta attività** (stato `dismissed`, resta nello storico) | [APPROVATO] |
| D31 | **Attività nel periodo**: senza giorno preciso ma con una finestra ("entro domenica", "entro fine mese", "entro il 20"). In Today compaiono in una riga discreta "Nel periodo", chiusa di default | [APPROVATO] |
| D32 | Promozione delle attività nel periodo in "Da fare oggi": **ultimo giorno** per finestre fino a 7 giorni, **ultimi 3 giorni** per finestre più lunghe. A finestra scaduta finiscono in "Rimaste indietro" | [APPROVATO] |
| D33 | In Settimana desktop le attività nel periodo stanno in una fascia "Periodo"; trascinandole su un giorno diventano attività di quel giorno | [APPROVATO] |
| D34 | **Planner pasti nell'MVP**: settimana con quattro pasti al giorno (colazione, pranzo, merenda, cena), ognuno **Pronto** o **Da preparare**, con casella **Preparato** | [APPROVATO] |
| D35 | Il planner suggerisce i **pasti ricorrenti** per ciascun momento, ordinati per frequenza, imparati dall'uso | [APPROVATO] |
| D36 | Pasto da preparare e non preparato → **attività normale il giorno prima** in Today ("Preparare il pranzo di domani"), che si spunta o si elimina. Spuntarla segna il pasto come preparato; eliminarla toglie solo il promemoria | [APPROVATO] |
| D37 | Navigazione mobile: la voce **Liste** raggruppa **Spesa · Pasti · Wishlist** | [APPROVATO] |
| D38 | Ingredienti dei pasti verso la lista della spesa | [FUTURO] |
| D39 | Calendario dell'iPhone (iCloud): **sola lettura**, in aggiunta a Google Calendar. Gli eventi si modificano nel Calendario dell'iPhone | [APPROVATO il 10 ottobre 2026] |
| D40 | Attività ed eventi ricavati dalle **mail**, sempre come proposte da confermare | [PROPOSTA] |
| D41 | **Allenamento come tipo a sé**, accanto ad attività ed eventi: si pianifica e si completa, se salta resta "saltato" e non finisce in Rimaste indietro. L'area di vita "Allenamento" esce dalle predefinite; nessuna voce nuova nella navigazione | [APPROVATO il 10 ottobre 2026] |
| D42 | Collegamento con **Salute di Apple** in sola lettura, tramite Comando rapido sull'iPhone (vedi 7.14) | [APPROVATO il 10 ottobre 2026; meccanismo DA VERIFICARE con uno spike] |
| D43 | **In casa**: nei Pasti, sezione chiusa di default con gli ingredienti comprati (spuntati nella Spesa) e non ancora finiti, anche dopo "Svuota completati". "Finito" li toglie. Il collegamento con i pasti è in D45 | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D44 | Wishlist: sui desiderati, un tocco sulla spunta della card sposta l'articolo in **Acquistati** (con annulla) | [APPROVATO l'11 ottobre 2026] |
| D45 | **Ingredienti in uso**: un ingrediente in casa è "in uso" quando il suo nome compare in un pasto da oggi in avanti (testo libero, singolare e plurale coincidono). "In casa" mostra prima quelli da usare, poi quelli già nei pasti con giorno e momento; sotto il pasto compaiono gli ingredienti riconosciuti e, a pasto cucinato o arrivato, la domanda "Finito?"; nel foglio del pasto gli ingredienti da usare si aggiungono al nome con un tocco. Una lista di ingredienti per ogni piatto resta [FUTURO] | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D46 | **Guardaroba**: nuova sezione dentro Liste (non un'app separata), con catalogo fotografico dei capi e outfit. Funziona per intero senza servizi AI; ogni classificazione proposta è correggibile | [APPROVATO l'11 ottobre 2026] |
| D47 | **Outfit**: dentro Guardaroba, selettore "Capi · Outfit". Un outfit è un elenco di capi senza struttura obbligatoria, mostrato come moodboard delle loro foto | [APPROVATO l'11 ottobre 2026] |
| D48 | **Indossato oggi**: registra l'utilizzo e chiede, capo per capo, se resta pulito, riutilizzabile o da lavare. Nessun capo diventa da lavare da solo. Un outfit con capi da lavare si segnala, non si nasconde | [APPROVATO l'11 ottobre 2026] |
| D49 | **Idee** (suggerimenti): terza voce del selettore in Guardaroba. Regole locali, deterministiche e spiegabili, senza servizi esterni né AI; tre modalità (per oggi, intorno a un capo, scopri); profilo di stile come orientamento, mai divieto; giudizi solo espliciti | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D50 | **Segni dei giorni**: un giorno si può segnare "in ufficio" o "in viaggio" (anche tutti e due). Il segno e l'allenamento in programma compaiono come piccole icone grigie nei Pasti, nel Guardaroba, in Oggi e in Settimana, per decidere cosa preparare e cosa mettere (vedi 7.16) | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D51 | **Outfit pianificati**: un outfit (salvato, o una proposta delle Idee) si pianifica per un giorno, con un evento di quel giorno o un'occasione scritta a mano. Non è un utilizzo e non crea eventi nel calendario. Si vede in Guardaroba ("In programma") e in Oggi. Un capo da lavare o rimosso si segnala, la scelta non cambia da sola | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D52 | Guardaroba, passi successivi nell'ordine: passaggio dalla Wishlist al guardaroba e compatibilità; statistiche. Meteo reale nelle Idee: da decidere (servizio esterno e posizione) | [PROPOSTA] |

---

## 3. Funzionalità

### 3.1 Richieste esplicitamente e approvate (MVP)

**Today**
- Vista giornaliera cronologica: eventi e attività con orario distinti dalle attività senza orario.
- Sezioni: Rimaste indietro, Agenda, Da fare oggi, Nel periodo, Da ricordare (vedi 7.1).
- Completamento con un tocco; rimanda; sposta ad altro giorno; cambia priorità/attenzione; modifica inline; dettagli on demand.
- Navigazione rapida giorno precedente/successivo (swipe orizzontale su mobile, frecce/tasti su desktop).
- Indicatore del carico della giornata (basato su durate di eventi e attività).

**Quick Capture**
- Accessibile da ogni schermata.
- Interpretazione in italiano di tipo, titolo, data, ora, durata, destinazione (agenda, spesa, wishlist, log).
- Anteprima dell'interpretazione correggibile prima del salvataggio.

**Calendario**
- Viste Day / Week / Month collegate.
- Week: carico per giorno, eventi, lezioni, attività importanti, spazi liberi, scadenze; spostamento elementi tra giorni (drag & drop su desktop, azione "Sposta" su mobile).
- Month: sintesi leggibile anche su smartphone (vedi 7.3).

**Attività**
- Singole, ricorrenti, con o senza data, con o senza scadenza, con orario e durata opzionali.
- Livello di attenzione (bassa/media/alta), area di vita opzionale.
- Ricerca e storico delle completate.

**Notifiche**
- Web Push sulla PWA installata, configurabili per livello.

**Spesa**
- Aggiunta immediata, completamento con un tocco, suggerimenti mentre si scrive (dai propri articoli), storico, quantità e reparto opzionali, "svuota completati", offline.

**Planner pasti** (vedi 7.13)
- Settimana, quattro pasti al giorno, Pronto/Da preparare, Preparato, ricorrenti suggeriti, attività il giorno prima.

**Allenamenti** (vedi 7.14)
- Disciplina, giorno, ora e durata facoltative, stato (in programma / fatto / saltato), misure facoltative (distanza, calorie, battito medio), note.
- Riepilogo della settimana e storico; dati da Salute di Apple (D42).

**Wishlist**
- Nome, categoria, link, prezzo, immagine, note, livello di interesse, stato (desiderato / acquistato / scartato).
- Recupero dati da link; import multiplo da testo ChatGPT.

**Personal Log**
- Registrazioni con titolo, data, ora opzionale, categoria, note, tag.
- Timeline storica ricercabile e filtrabile.
- Categorie sensibili con protezione Face ID/PIN e titoli neutri.
- Export ed eliminazione dati.

**Ricerca globale**
- Su attività, eventi, spesa, wishlist, log; filtri per tipo, area, intervallo temporale.
- Command palette da tastiera su desktop.

**Morning overview, Evening review, Templates** (vedi 7.8–7.9).

**Temi**: dark (principale) e light, scelta manuale.

### 3.2 Consigliate dal team (da approvare)
- **[PROPOSTA]** Ricorrenze in due modalità: **a calendario fisso** ("ogni lunedì") e **dopo il completamento** ("30 giorni dopo l'ultima volta"). Le seconde sono utili per attività domestiche e cura personale.
- **[PROPOSTA]** Aree di vita predefinite (Lavoro, Insegnamento yoga, Pratica yoga, Casa, Cura personale, Acquisti, Eventi; "Allenamento" è diventato un tipo a sé, D41), rinominabili e opzionali, ciascuna con un colore discreto usato solo come piccolo segno.
- **[PROPOSTA]** Fasce di silenzio per le notifiche (es. 22:00–7:30), salvo attenzione alta configurata diversamente.
- **[PROPOSTA]** Prefissi rapidi opzionali nel Quick Capture per chi vuole essere esplicito: `spesa:`, `wish:`, `log:`.
- **[PROPOSTA]** "Trasforma": convertire un elemento in un altro tipo (es. articolo wishlist → articolo spesa, attività → evento) senza riscriverlo.
- **[PROPOSTA]** Undo universale (toast "Annulla" per 5 s) su completamento, eliminazione, spostamento.
- **[PROPOSTA]** Dizionario iniziale minimo prodotto → reparto in italiano (es. tofu → Frigo), sovrascritto da ciò che l'app impara.

### 3.3 Idee per versioni successive
- **[APPROVATO, D11]** Integrazione imayoga (lezioni come eventi, sola lettura): vedi 7.12c.
- **[FUTURO]** Fallback AI per Quick Capture (escluso per categorie sensibili).
- **[FUTURO]** Smart rescheduling.
- **[FUTURO]** Condivisione liste (spesa) con altre persone.
- **[FUTURO]** Smart suggestions basate sulle abitudini.
- **[FUTURO]** Scorciatoie iOS (Comandi rapidi) per aprire direttamente Quick Capture o Spesa. I widget nativi non sono possibili con una PWA.
- **[FUTURO]** Monitoraggio prezzi wishlist.
- **[FUTURO]** Cifratura end-to-end delle registrazioni sensibili.
- **[FUTURO]** Ingredienti dei pasti aggiunti alla lista della spesa.

---

## 4. User journey principali

### J1 — Il mattino
1. Bibi apre l'app dalla schermata Home dell'iPhone.
2. In cima alla vista Today trova la **Morning overview**: una riga di sintesi ("3 appuntamenti, 4 attività, giornata media; scadenza X tra 3 giorni").
3. Scorre l'agenda (09:30 riunione, 17:00 pratica, 19:00 lezione), vede 2 attività in "Rimaste indietro" e le sposta a oggi con un'azione.
4. Chiude la overview, che non riappare fino al giorno dopo.

### J2 — Catturare in tre secondi
1. Da qualsiasi schermata tocca il pulsante di cattura (o `⌘K`/`N` su desktop).
2. Scrive "domani alle 20 mettere in ammollo le lenticchie".
3. L'anteprima mostra: Attività · domani · 20:00 · "Mettere in ammollo le lenticchie".
4. Invio. Se l'interpretazione è sbagliata, tocca il chip errato (es. la data) e lo corregge, senza aprire un form.

### J3 — Al supermercato senza rete
1. Apre Spesa: la lista è disponibile offline, raggruppata per reparto.
2. Spunta gli articoli mentre li prende; aggiunge "latte di avena" dai suggerimenti.
3. Al ritorno della rete le modifiche si sincronizzano senza intervento.
4. A casa usa "Svuota completati".

### J4 — Salvare i consigli di ChatGPT
1. Chiede a ChatGPT consigli skincare aggiungendo la frase del formato guidato (vedi 7.6).
2. Copia la risposta e in Wishlist sceglie "Incolla da testo".
3. L'app mostra gli articoli riconosciuti da confermare (nome, marca, categoria, prezzo se presente).
4. Conferma; gli articoli entrano con stato "desiderato".

### J5 — Registrare e ritrovare un evento personale
1. Scrive "unghie semipermanente viola" con il prefisso o dalla sezione Log; viene creata la Registrazione di oggi.
2. Settimane dopo cerca "unghie": vede l'elenco cronologico e l'indicazione "ultima volta: 18 giorni fa".
3. Per una categoria sensibile (es. ciclo) il Log richiede Face ID prima di mostrare il contenuto; nel calendario compare solo un segno neutro.

### J6 — Pianificare la settimana dal desktop
1. Apre Week su desktop: vede il carico di ogni giorno, eventi GCal, lezioni, scadenze, spazi liberi.
2. Trascina un'attività da un giorno sovraccarico a uno più libero.
3. Usa la command palette per aggiungere e cercare senza mouse.

### J7 — La sera
1. Dopo l'ora configurata, Today mostra in alto l'**Evening review**: ciò che è rimasto aperto oggi.
2. Per ogni elemento: completa, sposta a domani, scegli una data, oppure lascia (finirà in "Rimaste indietro").

---

## 5. Modello concettuale dei dati

> Concettuale, non schema finale. Lo schema SQL, gli indici e le policy RLS si definiscono in Fase 4.
> Ogni entità ha `id`, `owner_id`, `created_at`, `updated_at`, `deleted_at` (soft delete per sync e undo).

### 5.1 Entità

**Profile / Settings**
- timezone (IANA, es. `Europe/Rome`), tema, ora della morning overview, ora dell'evening review, fasce di silenzio, preferenze notifiche per livello, metodo di blocco del Log.

**Area** (area di vita, opzionale ovunque)
- nome, colore, ordine, archiviata.

**Event** (Evento — accade a un'ora, non si spunta)
- titolo, note, luogo
- `start_at`, `end_at` (timestamptz) **oppure** `all_day` con `date`/`end_date` (date locali)
- timezone dell'evento
- area_id?, recurrence_id?
- `source`: `app` | `gcal`
- `external_id`, `external_calendar_id`, `external_etag` (solo per eventi GCal)
- attenzione (bassa/media/alta)

**Task** (Attività — si completa)
- titolo, note
- `date` (data locale, opzionale), `time` (ora locale, opzionale), `duration_min` (opzionale)
- `due_date` (scadenza, opzionale; per le attività nel periodo è la fine della finestra)
- `window_start` (inizio della finestra, opzionale)
- `source` (manuale, ricorrenza, template, pasto) e collegamento al pasto che l'ha generata
- attenzione (bassa/media/alta), area_id?
- recurrence_id?
- `status`: `open` | `done` | `dismissed`
- `completed_at`
- `original_date` (per sapere da quando è "rimasta indietro")

**Workout** (Allenamento — si pianifica e si completa, ma non resta indietro)
- disciplina (testo libero), `date`, `time` (opzionale), `duration_min` (opzionale), note
- `status`: `planned` | `done` | `skipped`, `completed_at`
- distanza, calorie, battito medio (opzionali)
- `source`: `app` | `health`; identificativo dell'allenamento in Salute, per non duplicare

**LogEntry** (Registrazione — è già successo)
- titolo, note, `date`, `time` (opzionale)
- log_category_id, tag[]
- `is_sensitive` (ereditato dalla categoria, sovrascrivibile)

**LogCategory**
- nome, colore, `is_sensitive`, `track_last` (mostra "ultima volta"), ordine.
- Predefinite proposte: Ciclo (sensibile), Trattamenti (sensibile), Unghie, Parrucchiere, Estetica, Personale.

**List**
- `kind`: `shopping` | `wishlist`
- nome. Predisposta per membri futuri (condivisione [FUTURO]).

**ListItem** (Articolo)
- list_id, nome, quantità (testo libero, opzionale), `checked`, `checked_at`
- Spesa: department (opzionale)
- Wishlist: categoria, url, prezzo + valuta, image_url, note, interesse (1–3), `status`: `wanted` | `bought` | `discarded`, `metadata_source` (`manual` | `link` | `import`)

**ProductMemory** (catalogo appreso, mai gestito a mano)
- nome normalizzato, nome visualizzato, department, `use_count`, `last_used_at`.
- Alimenta suggerimenti e raggruppamento della spesa.

**MealPlan** (pasto pianificato)
- data, momento (colazione, pranzo, merenda, cena), nome, modalità (`ready` | `to_prep`), `prepared`, attività promemoria collegata.

**MealMemory** (pasti ricorrenti appresi)
- momento, nome, modalità abituale, numero di volte, ultimo uso.

**Recurrence**
- `mode`: `fixed` (regola RRULE: giorni, intervallo, fine) | `after_completion` (N giorni/settimane/mesi dopo l'ultimo completamento) — [PROPOSTA]
- Le occorrenze delle Attività ricorrenti vengono materializzate solo quando servono (prossima occorrenza); quelle degli Eventi vengono espanse in lettura. Dettagli in Fase 4.

**Reminder** (notifica pianificata)
- target (event | task | log_entry), `fire_at` (timestamptz), `kind` (`auto` per livello | `custom`), `sent_at`.

**Template**
- nome, elenco di voci (titolo, offset giorni, orario, durata, area, attenzione). Applicandolo si generano Attività.

**ExternalCalendar**
- provider (`google`), calendario selezionato, sync token, ultimo sync, token OAuth (custodito lato server).

### 5.2 Relazioni
- Area 1—N Event, Task.
- LogCategory 1—N LogEntry.
- List 1—N ListItem.
- Recurrence 1—N Task / Event.
- Event / Task / LogEntry 1—N Reminder.
- ExternalCalendar 1—N Event (`source = gcal`).

### 5.3 Regole temporali
- Eventi con orario: istanti assoluti (timestamptz) + timezone di riferimento.
- Attività e registrazioni: **date e ore locali** (non istanti), così "domani" resta domani anche cambiando fuso.
- "Oggi" e i confini del giorno si calcolano nel timezone del profilo.
- Cambio ora legale: gli eventi ricorrenti mantengono l'ora locale.

### 5.4 Livelli di attenzione e notifiche [APPROVATO]
| Livello | Comportamento di default |
|---|---|
| Bassa | Nessuna notifica; visibile solo in Today |
| Media | Una notifica (all'orario, o al mattino per elementi senza orario) |
| Alta | Notifica + richiamo il giorno prima |

Le categorie sensibili notificano sempre con titolo neutro ("Promemoria personale").

---

## 6. Architettura dell'informazione

```
App
├── Oggi (Today)                ← home
│   ├── Morning overview / Evening review (contestuali all'orario)
│   ├── Rimaste indietro
│   ├── Agenda (eventi + attività con orario)
│   ├── Da fare oggi (attività senza orario, attività nel periodo promosse, preparazioni dei pasti)
│   ├── Nel periodo (attività con finestra, chiusa di default)
│   └── Da ricordare (scadenze vicine, alta attenzione, segni del Log)
├── Calendario
│   ├── Giorno
│   ├── Settimana
│   └── Mese
├── Liste
│   ├── Spesa
│   ├── Pasti
│   └── Wishlist
├── Log
│   ├── Timeline
│   └── Categorie ("ultima volta")
├── Ricerca globale (overlay)
├── Quick Capture (overlay, ovunque)
└── Impostazioni
    ├── Aspetto (tema)
    ├── Notifiche (livelli, fasce di silenzio, orari overview/review)
    ├── Aree di vita
    ├── Categorie del Log e privacy (blocco)
    ├── Template
    ├── Google Calendar
    └── Dati (export, import, eliminazione account)
```

Le attività senza data non hanno una sezione "Inbox" dedicata nell'MVP: compaiono in ricerca e in un filtro "Senza data" dentro Calendario. **[PROPOSTA]** — da discutere in Fase 3.

---

## 7. Schermate e flussi di interazione

### 7.1 Today
- Header: giorno della settimana e data in grande, indicatore di carico sottile, frecce o swipe per giorno precedente/successivo, scorciatoia "Torna a oggi".
- **Rimaste indietro**: compressa di default ("2 rimaste indietro"), si espande al tocco. Azioni: **Oggi** · **Riprogramma** (modale con date rapide, data a scelta, Scarta attività). [APPROVATO, D30]
- **Nel periodo**: riga tratteggiata chiusa di default ("4 da fare nel periodo · 2 entro domenica · 2 entro fine mese"); aperta mostra le attività con la loro scadenza e il pulsante "Oggi" per anticiparle. [APPROVATO, D31–D32]
- **Agenda**: timeline verticale con linea "adesso"; eventi e attività con orario distinti visivamente (l'evento è un blocco, l'attività ha la casella di spunta).
- **Da fare oggi**: lista compatta con casella di spunta.
- **Allenamento**: gli allenamenti del giorno con il riepilogo della settimana, che apre lo storico. Compare solo se la settimana ne ha almeno uno. [APPROVATO, D41]
- **Da ricordare**: scadenze imminenti, elementi ad alta attenzione, segni discreti del Log.
- Azioni su un elemento:
  - Tocco sulla casella → completa (feedback animato + undo).
  - Tocco sul testo → modifica inline del titolo; chip modificabili per data, ora, attenzione.
  - Swipe a destra → completa; swipe a sinistra → menu Rimanda (Stasera · Domani · Fra una settimana · Scegli data). [PROPOSTA]
  - Pressione prolungata (mobile) / tasto destro o menu `…` (desktop) → menu contestuale completo.
  - Ogni azione via gesto ha un equivalente visibile (accessibilità).

### 7.2 Week
- Mobile: elenco verticale di 7 giorni con barra di carico e i 2–3 elementi principali per giorno; tocco → Day.
- Desktop: 7 colonne con eventi posizionati e attività in testa a ogni colonna; drag & drop tra giorni; spazi liberi leggibili.

### 7.3 Month
- Griglia con punti/segni minimi per giorno (eventi, scadenze, segni del Log), mai elenchi di testo nelle celle su mobile.
- Tocco su un giorno → anteprima del giorno sotto la griglia; doppio tocco → Day.

### 7.4 Quick Capture
- Mobile: pulsante centrale nella bottom navigation → foglio dal basso con campo testo e tastiera aperta.
- Desktop: `⌘K` / `Ctrl+K` apre la command palette (cattura + ricerca + comandi); `N` per cattura diretta.
- Sotto il campo: anteprima dell'interpretazione come chip (tipo · data · ora · durata · destinazione). Ogni chip è toccabile per correggere.
- Invio salva; il foglio resta aperto con "Aggiunto ✓" per inserimenti in serie [PROPOSTA].

**Regole di interpretazione iniziali (parser a regole) [PROPOSTA]**
| Input | Risultato |
|---|---|
| "Comprare tofu" | Articolo spesa "tofu" |
| "Domani mettere in ammollo i ceci" | Attività, domani |
| "Dentista martedì alle 15" | Evento, martedì prossimo, 15:00 |
| "Prenotare unghie" | Attività senza data |
| "Comprare mascara" | Articolo spesa (con chip per spostarlo in Wishlist) |
| "Inizio ciclo oggi" | Registrazione, categoria Ciclo, oggi |
| "Tra tre mesi ricordami di controllare una scadenza" | Attività tra 3 mesi, attenzione media |
| "wish: siero vitamina C" | Articolo wishlist |
| Un URL incollato | Articolo wishlist con recupero dati |

Riconoscimento di: oggi, domani, dopodomani, giorni della settimana, "tra N giorni/settimane/mesi", date ("12/10", "12 ottobre"), orari ("alle 15", "15:30", "stasera", "stamattina"), durate ("45 min", "un'ora"), verbi chiave (comprare, prenotare, iniziare/fine), parole chiave del Log apprese dalle categorie.
Ambiguità (es. evento o attività) → si sceglie il default e lo si rende evidente nei chip.

### 7.5 Spesa
- Campo di inserimento sempre in cima; suggerimenti dal ProductMemory mentre si scrive (es. "lat" → latte di soia, latte di avena, latte di mandorla), ordinati per frequenza e recenza.
- Articoli raggruppati per reparto; senza reparto in "Altro".
- Tocco → spunta (l'articolo scende nella sezione completati); "Svuota completati".
- Storico: articoli acquistati di recente da riaggiungere con un tocco.

### 7.6 Wishlist
- Elenco filtrabile per categoria e stato; card essenziali (immagine se presente, nome, prezzo se presente, interesse).
- Aggiunta: testo, URL (recupero dati), oppure "Incolla da testo".
- **Formato guidato per ChatGPT** [PROPOSTA] — frase da aggiungere alla richiesta:
  > "Alla fine, elenca i prodotti uno per riga in questo formato: Nome | Marca | Categoria | Prezzo indicativo | Nota breve"
- L'import mostra le righe riconosciute da confermare/modificare prima del salvataggio. Righe non riconosciute restano come testo da sistemare, mai scartate in silenzio.
- Recupero da link: legge metadati pubblici (titolo, immagine, prezzo se esposto). Se fallisce, salva URL e titolo inserito, segnalando cosa non è stato recuperato.

### 7.7 Personal Log
- Timeline cronologica raggruppata per mese; filtri per categoria, tag, periodo.
- Vista Categorie: per ogni categoria con `track_last`, "ultima volta: N giorni fa" e accesso all'elenco.
- Categorie sensibili: contenuto oscurato fino allo sblocco (Face ID/PIN), poi visibile per la sessione corrente con timeout.
- Nota: il blocco è una protezione dell'interfaccia, non cifratura aggiuntiva dei dati.

### 7.8 Morning overview ed Evening review
- Morning: card in cima a Today fino a un orario configurabile o alla chiusura; contiene numero di eventi/attività, carico, scadenze vicine, rimaste indietro. Nessuna statistica superflua.
- Evening: dopo un orario configurabile, card con le attività ancora aperte di oggi e azioni rapide (Completa · Domani · Scegli data · Lascia).
- Possono essere accompagnate da una notifica opzionale (spenta di default) [PROPOSTA].

### 7.9 Templates
- Creati da Impostazioni o salvando un gruppo di attività esistenti.
- Applicazione: scelta della data di partenza → generazione delle attività con i relativi offset.
- Esempi: "Preparazione lezione yoga", "Pulizie settimanali".

### 7.10 Ricerca globale
- Overlay con campo unico; risultati raggruppati per tipo; filtri per tipo, area, periodo.
- Ricerca tollerante a errori di battitura e spazi (es. "lent icchie" → lenticchie).
- Risultati del Log sensibile mostrati come neutri finché il Log non è sbloccato.

### 7.11 Navigazione
- **Mobile**: bottom navigation a 5 posizioni: Oggi · Calendario · [+ Cattura] · Liste · Log. Ricerca da icona in alto. Tutto raggiungibile con il pollice.
- **Desktop**: sidebar compatta (Oggi, Calendario, Spesa, Wishlist, Log, Impostazioni) + area principale; su schermi larghi pannello di dettaglio laterale. Scorciatoie da tastiera per navigazione e azioni.

### 7.12 Google Calendar
- Collegamento da Impostazioni (OAuth Google), scelta dei calendari personali da importare.
- Eventi GCal visibili in Today/Week/Month con un segno di provenienza; modificabili solo in GCal (nell'app: "Apri in Google Calendar").
- Eventi creati nell'app copiati su GCal; marcati con un identificativo dell'app per evitare duplicati alla rilettura.
- Sincronizzazione incrementale; conflitti e dettagli tecnici in `technical-design.md`.
- **Import una tantum da file `.ics`** [APPROVATO il 10 ottobre 2026] da Impostazioni → Dati: eventi e promemoria da Google Calendar, Calendario Apple o Outlook, con anteprima da confermare. Dettagli in `technical-design.md` 9.5.

### 7.12b Calendario iCloud [APPROVATO, D39]
- Collegamento da Impostazioni con Apple ID e password per app; scelta dei calendari da seguire.
- Eventi iCloud visibili in Today/Week/Month con un segno di provenienza; modificabili solo nel Calendario dell'iPhone.
- Una web app non può leggere il calendario del telefono: la lettura avviene dal server su iCloud. Dettagli in `technical-design.md` 9.6.

### 7.12c Lezioni da imayoga [APPROVATO, D11]
- Le lezioni che Bibi insegna arrivano da imayoga e compaiono in Today/Week/Month come eventi, con un segno di provenienza. Si modificano solo in imayoga.
- Entrano solo le lezioni **pubblicate**: le bozze restano fuori finché non vengono pubblicate.
- imayoga registra solo l'ora di inizio: la durata è **un'ora**.
- Le lezioni individuali compaiono **solo quando qualcuno le ha prenotate**; gli slot vuoti non si vedono. Il titolo non riporta il nome dell'allieva.
- Una lezione eliminata o tolta dalla pubblicazione in imayoga sparisce dal planner alla sync successiva.
- **[Aggiunto l'11 ottobre 2026, su richiesta di Bibi]** Toccando una lezione si apre il suo dettaglio: giorno e ora, **chi ha prenotato** (con i posti: "3 di 8"), la lista d'attesa e, per una lezione individuale, l'allieva. I nomi stanno solo nel dettaglio, mai nel titolo né nelle notifiche.
- **[Aggiunto l'11 ottobre 2026, su richiesta di Bibi]** Una lezione si può segnare **Da preparare**, come un pasto: nasce l'attività "Preparare la lezione: …" il giorno prima (oggi, se la lezione è oggi o domani). Completarla segna la lezione come preparata; toglierla riporta la lezione a "Niente da preparare". Se la lezione cambia giorno l'attività la segue, se sparisce da imayoga sparisce anche l'attività ancora da fare.
- Dettagli in `technical-design.md` 9.2.

### 7.13 Planner pasti [APPROVATO, D34–D37]
- Raggiungibile da Liste → Pasti (mobile) e dalla sidebar (desktop).
- Striscia dei 7 giorni in alto; sotto ogni giorno quattro puntini (vuoto = non pianificato, grigio = a posto, lilla = da preparare).
- Per il giorno scelto: colazione, pranzo, merenda, cena. Ogni pasto ha il selettore **Pronto / Da preparare** e, se da preparare, la casella **Preparato**.
- Pasto vuoto → foglio con i **ricorrenti** di quel momento ordinati per frequenza (ognuno ricorda la sua modalità abituale), oppure un nome nuovo.
- Pasto da preparare e non preparato → attività il giorno prima in Today; sotto il pasto una riga discreta indica dove si trova. Nessun banner di avviso.
- Notifica dell'attività: orario configurabile, proposta 20:00 del giorno prima (vedi `technical-design.md`).
- **In casa** (D43): in fondo, sezione chiusa di default con gli ingredienti comprati e non ancora finiti, per reparto. Un prodotto comprato più volte compare una volta sola. "Finito" lo toglie, con annulla.
- **Ingredienti in uso** (D45): conta la parola principale dell'ingrediente ("Yogurt greco" → yogurt) cercata come parola intera nel nome dei pasti da oggi alla fine della settimana prossima.
  - *In casa*: l'intestazione dice quanti sono ancora da usare ("12 ingredienti · 5 da usare"). Aperta, prima quelli da usare per reparto, poi "Già nei pasti", attenuati, con il primo pasto che li usa ("gio · cena").
  - *Sotto il pasto*: riga discreta "In casa" con gli ingredienti riconosciuti. Se il pasto è preparato, di oggi o passato, la riga diventa "Finito?" e un tocco sull'ingrediente lo toglie da In casa, con annulla.
  - *Foglio del pasto*: sotto il nome, "In casa, da usare": un tocco aggiunge l'ingrediente al nome ("Patate" → "Patate e fagiolini").

### 7.14 Allenamenti [APPROVATO, D41–D42]
- **Aggiungere**: da "Aggiungi" scegliendo Allenamento, oppure dal Quick Capture con una frase che comincia con una disciplina ("corsa domani alle 18 45 min"). In un giorno già passato nasce come fatto.
- **Discipline**: testo libero; si propongono prima quelle già usate, poi alcune predefinite (Allenamento, Corsa, Camminata, Forza, Palestra, Pilates, Nuoto, Bici).
- **Completare**: casella di spunta rotonda, con annulla. Un allenamento in programma in un giorno passato si mostra come **saltato**; non compare in Rimaste indietro e non va riprogrammato.
- **Today**: sezione "Allenamento" con gli allenamenti del giorno e il riepilogo della settimana ("2 di 3 · 1 h 30": fatti su totali, minuti fatti). Gli allenamenti in programma contano nel carico del giorno.
- **Calendario**: in Settimana si trascinano tra i giorni; in Mese hanno un segno proprio (un piccolo rombo).
- **Storico**: ultime 12 settimane con il riepilogo di ognuna; si apre da Today e da Impostazioni.
- **Trasforma in allenamento**: su attività ed eventi, tranne attività ricorrenti o nate da un pasto, serie ed eventi di altri calendari.
- **Salute di Apple** (D42): sola lettura. Un allenamento registrato da iPhone o Apple Watch completa quello in programma dello stesso giorno e disciplina; se non c'è, ne crea uno già fatto. Dettagli in `technical-design.md` 9.8.
- Non incluso per ora: ripetizioni degli allenamenti.

### 7.15 Guardaroba [APPROVATO, D46–D49 e D51; passi successivi PROPOSTA, D52]
Si apre da Liste → Guardaroba (su desktop anche dalla barra laterale). In alto il selettore **Capi · Outfit · Idee**; in Capi e Outfit c'è il campo di ricerca.

**Capi**
- **Aggiungere**: "Aggiungi" → foto scattata o caricata (facoltativa), nome (facoltativo), categoria. Tutto il resto sta in "Altri dettagli" e si completa quando si vuole: sottocategoria, marca, colori, stagioni, stili, occasioni, pesantezza da 1 a 5, uso a strati, materiale, preferito, stato, note.
- **Classificazione assistita**: stagioni, stili, occasioni, pesantezza e uso a strati vengono proposti dalla categoria e dalle parole del nome ("cappotto", "pizzo"…), con regole locali. Si correggono liberamente; dopo una correzione il sistema non le riscrive.
- **Stagionalità**: stagioni e pesantezza sono indicazioni, mai vincoli. Nessun capo viene escluso per la stagione.
- **Catalogo**: griglia fotografica; filtri a scelta multipla per categoria, stato, colore, stagione, stile, occasione e preferiti; ricerca per nome, marca e sottocategoria.
- **Selezione multipla** ("Seleziona"): Crea outfit · Indossati oggi · Da lavare · Pulito.
- **Scheda**: modifica, duplica (senza la foto propria), elimina con annulla.
- **Stato**: Pulito · Indossato (riutilizzabile) · Da lavare. Non c'è uno stato "in lavaggio".

**Outfit**
- **Comporre**: "Nuovo outfit" apre la scelta dei capi per categoria; oppure dalla selezione multipla del catalogo. Nessuna struttura obbligatoria: un outfit può essere incompleto o avere più strati.
- **Moodboard**: le foto dei capi in ordine dall'esterno verso l'interno (capospalla, top, vestito, pantaloni o gonna, scarpe, borsa, accessori). Sono le stesse foto del catalogo, mai copie.
- **Sostituire**: un tocco su un capo della moodboard apre i capi della stessa categoria; da lì si sostituisce o si toglie.
- **Dettagli**: nome (facoltativo), stili, occasioni e stagioni proposti dai capi scelti e correggibili, preferito, note.
- **Elenco**: preferiti in testa, poi i più recenti; ogni card mostra l'ultima volta indossato e segnala i capi da lavare. Elimina con annulla.
- Un capo eliminato dal guardaroba non rompe l'outfit: l'outfit avvisa che un capo non c'è più.

**Indossato oggi**
- Dall'outfit ("Indossato oggi") o dalla selezione multipla dei capi ("Indossati oggi").
- Per ogni capo si sceglie Pulito · Riutilizzabile · Da lavare. Proposta di partenza: riutilizzabile; scarpe, borse, accessori e capispalla restano come sono; un capo già da lavare resta da lavare.
- L'utilizzo entra nello storico (giorno, outfit, capi) e si può annullare dal toast, che riporta anche i capi allo stato di prima.
- Un utilizzo è distinto da una pianificazione (D51).

**Offline**: capi, outfit e utilizzi si leggono e si modificano senza rete; solo il caricamento della foto la richiede.

**Idee** (D49)
- **Per oggi**: proposte ordinate per pertinenza, tre alla volta; "Altre idee" mostra le successive. Si può indicare l'occasione e che tempo fa (Stagione · Freddo · Mite · Caldo).
- **Intorno a un capo**: dalla scheda di un capo, "Abbina". Tre proposte diverse tra loro: **Consigliato** (la più coerente con il contesto), **Elegante** (privilegia l'estetica), **Alternativo** (un abbinamento meno abituale). Vale anche per un capo da lavare: la scelta si può sempre forzare.
- **Scopri**: parte dai capi mai indossati o meno usati e propone abbinamenti mai indossati né salvati.
- **Cosa conta**: armonia dei colori, coerenza di stile, occasione, comfort termico (pesantezza, capospalla, stagione come indicazione), disponibilità dei capi, profilo di stile, giudizi dati, varietà rispetto agli ultimi 14 giorni.
- **Motivazione**: ogni proposta dice in una frase perché è lì, usando solo ciò che i dati dei capi permettono di affermare. Senza temperatura indicata compare "Non considera il meteo"; i capi da lavare sono segnalati, non esclusi.
- **Azioni**: Mi piace · Non mi piace · Salva (apre il nuovo outfit con quei capi) · Pianifica · Indossato oggi. Una combinazione scartata non viene riproposta (si annulla dal toast); ciò che non viene scelto non conta come giudizio negativo.
- **Il mio stile**: stili e colori preferiti e parole da evitare, cercate nei testi dei capi. Parte dalle preferenze indicate da Bibi e si modifica quando si vuole; richiede la rete, come le altre impostazioni.

**Pianificare** (D51)
- **Da dove**: "Pianifica" nell'outfit salvato o su una proposta delle Idee.
- **Cosa si sceglie**: il giorno (da oggi in avanti); facoltativi un evento di quel giorno, scelto dall'elenco, oppure un'occasione scritta a mano ("Cena fuori"). Più outfit nello stesso giorno sono ammessi.
- **Tre cose distinte**: proposta (Idee), pianificazione (In programma), utilizzo (storico). Pianificare non registra un utilizzo e non crea né modifica eventi.
- **In programma**: in Guardaroba → Outfit, dal giorno più vicino, con Cambia giorno e Togli (con annulla). Nel giorno stesso compare "Indossato oggi".
- **Oggi**: nel giorno pianificato compare la sezione "Outfit" con le foto dei capi; un tocco porta al Guardaroba.
- **Capi non disponibili**: "Un capo è da lavare" o "Un capo non è più nel guardaroba" compaiono sulla pianificazione; la scelta resta com'è finché non la cambi tu.
- Se l'outfit salvato viene modificato, la pianificazione mostra i capi nuovi; se viene eliminato, restano quelli del momento in cui è stato pianificato.

Non incluso per ora (D52): meteo reale, motivazione facoltativa quando si scarta, regolazione dei pesi dall'interfaccia, outfit pianificati dentro Settimana e Mese o nella scheda dell'evento, collegamento con la Wishlist, statistiche, riconoscimento delle foto.

### 7.16 Segni dei giorni [APPROVATO, D50; dettagli PROPOSTA]
- **Segni**: Ufficio (valigetta) e Viaggio (aereo), messi a mano; Allenamento (muscolo), che arriva da solo dagli allenamenti in programma o fatti (non da quelli saltati).
- **Aspetto**: icone piccole e grigie, mai colore né testo nelle strisce dei giorni. Niente notifiche, niente effetto sul carico del giorno.
- **Segnare**: riga discreta sotto il titolo del giorno ("Segna il giorno", poi "Ufficio · Corsa 18:00"); un tocco apre il foglio con Ufficio e Viaggio, che si mettono e si tolgono.
- **Pasti**: icone sotto i puntini di ogni giorno della striscia; riga del giorno con segni e allenamenti.
- **Guardaroba**: in alto i prossimi sette giorni da oggi con i loro segni; un tocco su un giorno lo segna.
- **Oggi**: riga sotto la data, solo ufficio e viaggio (gli allenamenti hanno già la loro sezione). **Settimana**: icone accanto alla data, mobile e desktop.
- Non incluso per ora: segnare più giorni insieme (un viaggio si segna giorno per giorno), altri tipi di segno, icone nelle celle del Mese, ricerca.

---

## 8. Requisiti trasversali

- **Accessibilità**: WCAG 2.1 AA, contrasti verificati in dark e light, target touch ≥ 44 px, navigazione completa da tastiera, alternative visibili a ogni gesto, rispetto di `prefers-reduced-motion`.
- **Performance**: Today interattiva in < 1 s su iPhone con dati in cache; inserimento ottimistico (l'UI non aspetta il server).
- **Sicurezza**: Row Level Security su ogni tabella, token OAuth solo lato server, nessun dato personale in URL o log.
- **Data ownership**: export completo (JSON + CSV per sezione; eventi anche in iCal) [PROPOSTA formati]; eliminazione completa dell'account.
- **Fusi orari e ricorrenze**: vedi 5.3.
- **Lingua**: interfaccia e parser in italiano.

### Vincoli noti della piattaforma
- iOS: Web Push funziona solo con la PWA installata nella schermata Home (iOS 16.4+); la puntualità al minuto non è garantita.
- iOS: nessun widget nativo per PWA; possibili scorciatoie tramite Comandi rapidi.
- Free tier Supabase: pausa del progetto dopo circa una settimana di inattività; nessun backup scaricabile.
- Free tier Vercel: i cron job hanno frequenza limitata; l'invio puntuale delle notifiche richiederà probabilmente uno scheduler lato Supabase. **Da verificare in Fase 4.**
- Recupero dati da Amazon, Sephora, Douglas, Zalando: probabili blocchi o dati parziali. Da testare su link reali.

---

## 9. MVP e roadmap

### MVP — incrementi
L'ordine aggiornato, con il planner pasti e i criteri di accettazione, è nella sezione 13 di `technical-design.md`. L'elenco qui sotto resta come riferimento funzionale.
1. **Fondamenta**: progetto Next.js, Supabase, autenticazione, PWA installabile, design tokens dark/light, layout mobile e desktop.
2. **Today + Attività + Eventi**: CRUD, completamento, rimanda/sposta, rimaste indietro, ricorrenze.
3. **Quick Capture** con parser a regole e anteprima correggibile.
4. **Calendario** Week e Month, drag & drop desktop.
5. **Spesa** con ProductMemory, reparti appresi, offline.
5b. **Planner pasti** con ricorrenti e attività del giorno prima.
6. **Personal Log** con categorie, "ultima volta", blocco Face ID/PIN, titoli neutri.
7. **Wishlist** con recupero da link e import da ChatGPT.
8. **Notifiche** per livello, fasce di silenzio.
9. **Ricerca globale** e command palette.
10. **Morning overview, Evening review, Templates**.
11. **Google Calendar** (lettura + scrittura eventi dell'app).
12. **Export, backup automatico, eliminazione dati**.

### Dopo l'MVP
Vedi 3.3.

---

## 10. Punti aperti

| # | Tema | Prossimo passo |
|---|---|---|
| A1 | Integrazione imayoga | Chiuso il 10 ottobre 2026 (D11, `technical-design.md` 9.2) |
| A2 | Proposte marcate [PROPOSTA] | Approvazione in revisione di questo documento o in Fase 3 |
| A3 | Destinazione del backup automatico (es. Google Drive, repository privato, email) | Fase 4 |
| A4 | Scheduler delle notifiche entro i free tier | Fase 4 |
| A5 | Browser e sistema operativo desktop | Da chiedere prima dei test |
| A6 | Sezione per attività senza data ("Inbox" sì/no) | Ancora aperto: nel prototipo compaiono in ricerca e filtri |
| A7 | Swipe su mobile come scorciatoia aggiuntiva | Ancora aperto: il prototipo usa tocchi e pulsanti espliciti |
| A8 | Riprogramma anche sulle attività di oggi (menu contestuale), non solo sulle rimaste indietro | Ancora aperto |
| A9 | Nome dell'app | Ancora aperto ("planner" è un segnaposto) |

## 11. Prossime fasi
- **Fase 3 — UX/UI**: completata. Prototipo navigabile (12 schermate, incluso il planner pasti) e design system v0.1 sulla tela di design.
- **Fase 4 — Technical Design**: in revisione, vedi `technical-design.md`.
- **Fase 5 — Implementazione**: solo dopo approvazione esplicita.
