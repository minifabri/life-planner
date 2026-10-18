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
| D43 | **In casa**: nei Pasti, sezione chiusa di default con gli ingredienti comprati (spuntati nella Spesa) e non ancora finiti, anche dopo "Svuota completati". "Finito" li toglie e li rimette nella Spesa, se non ci sono già. Il collegamento con i pasti è in D45 | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D44 | Wishlist: sui desiderati, un tocco sulla spunta della card sposta l'articolo in **Acquistati** (con annulla) | [APPROVATO l'11 ottobre 2026] |
| D45 | **Ingredienti in uso**: un ingrediente in casa è "in uso" quando il suo nome compare in un pasto da oggi in avanti (testo libero, singolare e plurale coincidono). "In casa" mostra prima quelli da usare, poi quelli già nei pasti con giorno e momento; sotto il pasto compaiono gli ingredienti riconosciuti e, a pasto cucinato o arrivato, la domanda "Finito?"; nel foglio del pasto gli ingredienti da usare si aggiungono al nome con un tocco. Una lista di ingredienti per ogni piatto resta [FUTURO] | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D46 | **Guardaroba**: nuova sezione dentro Liste (non un'app separata), con catalogo fotografico dei capi e outfit. Funziona per intero senza servizi AI; ogni classificazione proposta è correggibile | [APPROVATO l'11 ottobre 2026] |
| D47 | **Outfit**: dentro Guardaroba, selettore "Capi · Outfit". Un outfit è un elenco di capi senza struttura obbligatoria, mostrato come moodboard delle loro foto | [APPROVATO l'11 ottobre 2026] |
| D48 | **Indossato oggi**: registra l'utilizzo e chiede, capo per capo, se resta pulito, riutilizzabile o da lavare. Nessun capo diventa da lavare da solo. Un outfit con capi da lavare si segnala, non si nasconde | [APPROVATO l'11 ottobre 2026] |
| D49 | **Idee** (suggerimenti): terza voce del selettore in Guardaroba. Regole locali, deterministiche e spiegabili, senza servizi esterni né AI; tre modalità (per oggi, intorno a un capo, scopri); profilo di stile come orientamento, mai divieto; giudizi solo espliciti | [APPROVATO l'11 ottobre 2026; dettagli PROPOSTA] |
| D50 | **Segni dei giorni**: un giorno si può segnare "in ufficio" o "in viaggio" (anche tutti e due). Il segno e l'allenamento in programma compaiono come piccole icone grigie nei Pasti, nel Guardaroba, in Oggi e in Settimana, per decidere cosa preparare e cosa mettere (vedi 7.16) | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D51 | **Outfit pianificati**: un outfit (salvato, o una proposta delle Idee) si pianifica per un giorno, con un evento di quel giorno o un'occasione scritta a mano. Non è un utilizzo e non crea eventi nel calendario. Si vede in Guardaroba ("In programma") e in Oggi. Un capo da lavare o rimosso si segnala, la scelta non cambia da sola | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D52 | **Wishlist e guardaroba**: un articolo della wishlist può essere segnato come capo (tipo, colori, stili) e viene confrontato con il guardaroba; un articolo acquistato diventa un capo senza reinserire i dati, e il capo ricorda l'articolo da cui nasce. Resta una sola wishlist | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D53 | **Numeri** (statistiche del guardaroba): quarta voce del selettore. Poche cifre ricavate dallo storico: più indossati, outfit più indossati, mai indossati, fermi da più di due mesi, mai abbinati. Niente grafici | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D54 | **Capo nuovo, proposte automatiche**: dalla foto l'app propone colori, categoria, tipo di capo e, quando sono evidenti, stile e materiale; il nome viene proposto da tipo e colore. Tutto nel dispositivo, senza servizi a pagamento, e sempre correggibile | [RICHIESTO il 12 ottobre 2026; dettagli PROPOSTA] |
| D55 | **Meteo nel Guardaroba**: una città fissa scelta nelle Impostazioni (non la posizione del telefono); la previsione arriva da Open-Meteo, gratuito e senza registrazione, unica eccezione a "nessun servizio esterno" delle Idee (D49). Le Idee partono dal meteo di oggi, e "Pianifica" e "In programma" mostrano la previsione del giorno scelto, fino a 16 giorni. Senza città tutto resta come prima | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D56 | **Google Calendar dall'indirizzo segreto iCal**: in sola lettura, per uno o più calendari, in attesa della sync OAuth di D9 (che resta per scrivere su Google gli eventi dell'app). Gli eventi si modificano su Google; Google aggiorna l'indirizzo con qualche ora di ritardo | [RICHIESTO il 15 ottobre 2026; dettagli PROPOSTA] |
| D57 | **Tipi di evento discreti**: *spedizione* (evento il cui titolo inizia con 📦, da qualunque calendario) e *compleanno* (creato nell'app: tutto il giorno, ogni anno in automatico). Non entrano nell'agenda né nel carico della giornata: compaiono in piccolo, in grigio, con un'icona, sotto il titolo del giorno in Oggi, in cima ai giorni della Settimana e nell'anteprima del Mese | [RICHIESTO il 15 ottobre 2026; dettagli PROPOSTA] |
| D56 | **Pasti, vista settimanale**: in alto il selettore **Giorno · Settimana · Idee**. Settimana mostra i sette giorni con i quattro pasti ciascuno; un tocco apre il foglio del pasto | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D57 | **Nutrienti dei pasti**: proteine, carboidrati, grassi e fibre riconosciuti dal nome del piatto con un dizionario locale. Indicazione qualitativa (quali nutrienti, non quanti grammi), correggibile a mano per ogni piatto; nessun servizio esterno né AI | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D58 | **Idee per i pasti**: regole locali e spiegabili come nel Guardaroba. Propongono i piatti abituali e anche piatti nuovi inclusi nell'app. **I piatti proposti dall'app sono solo vegani, per chiunque la usi**: niente carne, pesce, uova, latticini o miele | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D59 | **Micronutrienti del giorno**: nel Giorno dei Pasti, riepilogo di ferro, calcio, zinco, omega-3, vitamina A, vitamina C e folati, riconosciuti dal nome del piatto con un dizionario locale di buone fonti. La riga resta discreta; aperta mostra un piccolo grafico a barre di nutrienti e micronutrienti nei pasti del giorno | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D60 | **Extra del giorno**: nei Pasti, sotto i quattro pasti, una riga facoltativa per ciò che si mangia fuori pasto o in accompagnamento (condimenti, spuntini). Testo libero, una riga per giorno; conta nei nutrienti e nei micronutrienti come un pasto in più | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D61 | **Mangiato fuori**: un pasto si può segnare come mangiato fuori senza scrivere il piatto. Il momento risulta occupato; senza nome non conta nei nutrienti, con il nome (facoltativo) sì | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D62 | **Idee nel foglio del pasto**: aggiungendo un pasto, sotto i ricorrenti compaiono tre idee per quel momento, con "Altre idee" e **Meno** ("Meno spesso": il piatto non viene proposto per tre settimane, poi torna). L'esempio nel campo segue il momento (a merenda non "riso e lenticchie") | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D63 | **Più piatti proposti, che cambiano**: l'elenco dei piatti dell'app (vegani, con almeno due nutrienti e un micronutriente riconosciuti) passa da 40 a circa 150 e resta nell'app, senza servizi esterni. I piatti nuovi girano di settimana in settimana e vengono prima quelli con ingredienti già usati spesso | [APPROVATO il 12 ottobre 2026; dettagli PROPOSTA] |
| D64 | **Calendario più leggibile**: gli eventi prendono la sfumatura e una striscia a sinistra del colore della loro area (non più solo il punto), con il nome dell'area accanto all'orario. Gli allenamenti hanno un colore proprio, l'arancio della palette (`--workout`), e l'icona del muscolo: *in programma* bordo tratteggiato arancio, *fatto* sfumatura piena con la spunta, *saltato* grigio con "saltato"; mai barrati. Nel Mese l'allenamento è un punto arancio: il rombo resta solo a scadenze e cose importanti. In Settimana su desktop la zona "Senza orario" è separata dall'agenda oraria; i giorni passati sono attenuati meno e le righe di dettaglio sono più grandi | [APPROVATO il 16 ottobre 2026] |
| D65 | **Di stagione**: un calendario di frutta e verdura italiane, mese per mese, nell'app e senza servizi esterni. Nella **Spesa** una riga discreta in fondo, "Di stagione a ottobre", con frutta e verdura del mese da aggiungere con un tocco (prima quelle che compri già). Nelle **Idee per i pasti** la stagione conta come un fattore in più: un piatto fuori stagione scende, non sparisce. Nel **Guardaroba** (catalogo e scelta dei capi per un outfit) vengono prima i capi di stagione; quelli fuori stagione restano a un tocco, sotto "Fuori stagione · N". Ricerca e filtro per stagione mostrano tutto insieme | [PROPOSTA, 16 ottobre 2026] |
| D66 | **Condimenti del pasto**: nel foglio di un pasto, sotto il piatto, un campo facoltativo per i condimenti (olio, limone…). Non entrano nel nome del piatto né nel titolo; contano nei nutrienti, nei micronutrienti e negli ingredienti in casa usati, e si vedono nella riga piccola sotto il piatto | [RICHIESTO il 16 ottobre 2026; dettagli PROPOSTA] |
| D67 | **Tour guidato**: al primo accesso, su Oggi, un tour mette in evidenza le parti vere dell'app (lo schermo si scurisce e un riflettore illumina un elemento alla volta) con un fumetto. **Il tour non spiega l'ovvio** (che Settimana mostra la settimana): per ogni parte fa scoprire una funzione poco visibile, per esempio «spesa: ceci», «ogni lunedì», l'articolo urgente che diventa un'attività in Oggi, il trascinamento nel calendario. Una **X** lo chiude in ogni momento, **Ho capito** alla fine. Su iPhone segue la barra in basso, su desktop la barra laterale. Una volta visto o saltato non ricompare, su nessun dispositivo (salvato sul profilo); si rivede da Impostazioni › Guida. Testi neutri rispetto al genere, per chiunque usi l'app. Ogni sezione (Calendario, Spesa, Pasti, Wishlist, Guardaroba, Log) ha poi un breve tour suo, di 2–4 trucchi di quella sezione, che parte la prima volta che la si apre, mai prima del tour iniziale e mai insieme a lui; anche questi si rivedono da Impostazioni › Guida | [APPROVATO il 16 ottobre 2026; tour di sezione approvati lo stesso giorno, poi riscritti sui trucchi e con la X su richiesta di Bibi] |
| D68 | **Attività ed eventi riservati e previsioni del ciclo**. Un'attività o un evento creato nell'app si può segnare **Riservato**: a Log bloccato compare ovunque (Oggi, Settimana, Mese, notifiche) come «Attività riservata» / «Evento riservato», con giorno, orario e durata veri, così il giorno non sembra libero; titolo, note, luogo, area e attenzione si vedono solo a Log sbloccato (stesso PIN / Face ID). Non compare nella ricerca né nell'export a Log bloccato. Per salvarlo serve la connessione; un'attività riservata non si ripete. Dalle registrazioni della categoria **Ciclo** del Log, nel **Mese** e solo a Log sbloccato: giorni del ciclo previsto (anello tratteggiato) e giorni fertili stimati (fondo tenue), con la durata media del ciclo e la nota che è una stima del calendario, non un metodo contraccettivo. A Log bloccato del ciclo non si vede nulla | [RICHIESTO il 16 ottobre 2026; scelte di Bibi: blocco neutro a Log bloccato, previsioni nel Mese; dettagli PROPOSTA] |
| D69 | **Lavatrici e guardaroba**. Ogni capo ha un **gruppo di lavaggio**: Scuri · Chiari · Colorati · Delicati. L'app lo ricava da colori e materiale (lana, seta, pizzo… → delicati; tra più colori vince il più rischioso: bianco e nero va con gli scuri) e si cambia nella scheda; scelto a mano non viene riscritto. In Guardaroba la riga **Da lavare** conta i capi da lavare per gruppo (un tocco filtra il catalogo) e propone la **lavatrice di un gruppo** quando: un capo da lavare serve per un outfit in programma nei prossimi 4 giorni (urgente, "entro" il giorno prima), restano pochi top, pantaloni o vestiti puliti, oppure il gruppo ha un carico pieno (6 capi, 4 i delicati, poi la mediana delle ultime lavatrici del gruppo). Azioni: **Fatta**, **Pianifica** (diventa l'attività "Lavatrice scuri" nel giorno e all'ora scelti, nell'area Casa se c'è), **Non ora** (torna quando si aggiungono capi; non per le urgenti). Completare una lavatrice, anche scritta a mano ("Lavatrice scuri", "bucato bianchi"), apre l'elenco dei capi da lavare del gruppo già scelti, più quelli indossati da aggiungere: tornano puliti solo quelli confermati, con annulla. In **Oggi** compare solo ciò che preme: un capo che serve entro domani senza una lavatrice in tempo. Con la città del meteo, una nota per stendere ("Domani pioggia probabile: per stendere, meglio oggi"). Resta senza uno stato "in lavaggio"; scarpe e borse sono escluse | [RICHIESTO il 18 ottobre 2026; scelte: quattro gruppi, nessuno stato "in lavaggio", urgenze anche in Oggi; dettagli PROPOSTA] |

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
- **[PROPOSTA]** Aree di vita predefinite (Lavoro, Insegnamento yoga, Pratica yoga, Casa, Cura personale, Acquisti, Eventi; "Allenamento" è diventato un tipo a sé, D41), rinominabili e opzionali, ciascuna con un colore discreto usato come piccolo segno e, sui blocchi degli eventi nel calendario, come sfumatura con striscia (D64).
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

**[Aggiunto il 12 ottobre 2026, su richiesta di Bibi]** Un'attività con una data può essere segnata come **promemoria**: manda una notifica all'orario (al mattino se non ha un orario) anche con attenzione bassa.

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
- **Ciclo** (D68), solo a Log sbloccato: anello tratteggiato attorno al numero nei giorni di ciclo previsto, fondo tenue nei giorni fertili; sotto la legenda la durata media e il prossimo ciclo previsto (o il ritardo). In fondo alla legenda "Mostra riservati" / "Nascondi riservati" sblocca e blocca senza passare dal Log.

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
- **Di stagione** (D65): in fondo, sottovoce, "Di stagione a {mese}": fino a dieci tra frutta e verdura del mese, alternate, da aggiungere con un tocco. Prima quelle che compri già, con il tuo nome; niente di ciò che è già in lista o già proposto sopra. Non compare mentre si scrive. Patate, carote, cipolle, limoni e i prodotti d'importazione non hanno stagione e non vengono proposti.
- **Urgente** (15 ottobre 2026): dalla modifica dell'articolo. Crea in Oggi l'attività "Comprare …" da completare entro due giorni (entro dopodomani), con attenzione alta. Articolo e attività restano allineati: spuntarne uno completa l'altro, eliminare l'articolo elimina l'attività ancora da fare, eliminare l'attività lascia l'articolo in lista non più urgente.

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
- Lo stesso sblocco apre anche attività ed eventi riservati (D68).

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

- **Indirizzo segreto iCal** (D56): oggi la lettura di Google passa da qui, da Impostazioni → Calendari → Google Calendar. Dettagli in `technical-design.md` 9.1b.
- **Spedizioni e compleanni** (D57): vedi la tabella delle decisioni.

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
- **Mangiato fuori** (D61): su un pasto vuoto, accanto ad "Aggiungi", un tocco su "Mangiato fuori" lo segna subito. Nel foglio del pasto la stessa casella vale anche per un pasto già scritto: il piatto diventa facoltativo, spariscono Pronto / Da preparare e l'eventuale attività di preparazione. Un pasto fuori non entra tra i ricorrenti e, senza nome, non conta nei nutrienti.
- **Extra** (D60): sotto la cena, riga tratteggiata "Extra · facoltativo". Si scrive in un solo campo ("olio, noci, cioccolato fondente"); i nutrienti si riconoscono e si correggono come per un piatto, e gli extra già usati tornano tra i ricorrenti. Compare anche nella Settimana. Non ha puntino nella striscia dei giorni e non riceve Idee.
- Pasto da preparare e non preparato → attività il giorno prima in Today (per un pasto di oggi, oggi stesso, con un orario prima del pasto); sotto il pasto una riga discreta indica dove si trova. Nessun banner di avviso.
- Notifica dell'attività: orario configurabile, proposta 20:00 del giorno prima (vedi `technical-design.md`).
- **In casa** (D43): in fondo, sezione chiusa di default con gli ingredienti comprati e non ancora finiti, per reparto. Un prodotto comprato più volte compare una volta sola. "Finito" lo toglie e lo rimette nella Spesa da comprare (se non c'è già), con annulla.
- **Ingredienti in uso** (D45): conta la parola principale dell'ingrediente ("Yogurt greco" → yogurt) cercata come parola intera nel nome dei pasti da oggi alla fine della settimana prossima.
  - *In casa*: l'intestazione dice quanti sono ancora da usare ("12 ingredienti · 5 da usare"). Aperta, prima quelli da usare per reparto, poi "Già nei pasti", attenuati, con il primo pasto che li usa ("gio · cena").
  - *Sotto il pasto*: riga discreta "In casa" con gli ingredienti riconosciuti. Se il pasto è preparato, di oggi o passato, la riga diventa "Finito?" e un tocco sull'ingrediente lo toglie da In casa, con annulla.
  - *Foglio del pasto*: sotto il nome, "In casa, da usare": un tocco aggiunge l'ingrediente al nome ("Patate" → "Patate e fagiolini").

- **Viste** (D56): selettore **Giorno · Settimana · Idee**. *Settimana*: il riepilogo dei nutrienti e, sotto, i sette giorni con i quattro pasti (su desktop in due colonne); un tocco su un pasto o su "Aggiungi" apre lo stesso foglio del Giorno. Le frecce in alto cambiano settimana in tutte le viste.
- **Nutrienti** (D57):
  - *Sotto ogni pasto*: i nutrienti del piatto ("Proteine · Carboidrati · Fibre"), oppure l'invito a indicarli se il nome non li dice.
  - *Nel giorno*: una riga discreta dice cosa c'è e cosa manca ("Nel giorno: proteine e carboidrati. Mancano: grassi e fibre."), con sotto i micronutrienti (D59). Un tocco la apre.
  - *Nella settimana*: tabella nutrienti × giorni (un segno più pieno dove più pasti del giorno portano quel nutriente), il totale dei pasti e una frase ("Poche fibre nella settimana.", "Settimana ben distribuita."). Il giudizio arriva solo con almeno quattro pasti riconosciuti.
  - *Correggere*: nel foglio del pasto, quattro pulsanti. La correzione vale per quel piatto ogni volta che torna, in qualunque momento della giornata; rimettere ciò che il nome dice già la toglie.
  - È un'indicazione dai nomi, non dalle quantità: il condimento e le porzioni non si vedono. Per questo la soglia dei grassi è più bassa delle altre.
- **Micronutrienti del giorno** (D59):
  - *Quali*: ferro, calcio, zinco, omega-3, vitamina A, vitamina C, folati. Riconosciuti dal nome del piatto, come i nutrienti: un piatto "porta" un micronutriente se nomina un alimento che ne è una buona fonte (lenticchie → ferro, zinco e folati; noci → omega-3 e zinco).
  - *Riga chiusa*: nomina il gruppo più corto ("Micronutrienti: mancano calcio e omega-3.", "Micronutrienti: solo ferro e vitamina C.", "Micronutrienti: ci sono tutti.").
  - *Aperta*: un piccolo grafico a barre, nutrienti e micronutrienti. Ogni barra ha un segmento per pasto riconosciuto del giorno, pieno per i pasti che lo portano, e il conto ("2/3"). Colori neutri: niente rosso né oro.
  - Non incluso: correzione a mano dei micronutrienti, vitamina B12 e vitamina D (nei piatti vegetali non ci sono: vengono da integratore e sole), micronutrienti nella settimana e nelle Idee.
- **Idee** (D58): per il giorno scelto, fino a tre proposte per ogni momento ancora vuoto; "Altre idee" mostra le successive.
  - *Da dove vengono*: i piatti già usati in quel momento e quaranta piatti semplici inclusi nell'app (segnati "Nuovo"), tutti vegani. Ogni terza proposta è un piatto nuovo.
  - *Cosa conta*: i nutrienti che scarseggiano nella settimana e quelli che mancano nel giorno, gli ingredienti in casa da usare, la varietà rispetto ai giorni vicini, l'abitudine, il tipo di giorno (proteine nel giorno di allenamento; a pranzo in ufficio ciò che si prepara prima), la stagione di frutta e verdura nel piatto (D65: "Di stagione: zucca"; fuori stagione scende, non sparisce).
  - *Motivazione*: ogni proposta dice in una frase perché è lì.
  - *Azioni*: **Aggiungi** mette il piatto in quel momento, con la sua modalità abituale; **Non proporre** lo toglie dalle idee di quel momento, con annulla. Metterlo a mano lo fa tornare.
  - Per i giorni passati non ci sono idee.
- Non incluso per ora: grammi e calorie, obiettivi personali, preferenze alimentari dichiarate (si usa "Non proporre"), idee per più giorni insieme, ingredienti delle idee verso la Spesa.

### 7.14 Allenamenti [APPROVATO, D41–D42]
- **Aggiungere**: da "Aggiungi" scegliendo Allenamento, oppure dal Quick Capture con una frase che comincia con una disciplina ("corsa domani alle 18 45 min"). In un giorno già passato nasce come fatto.
- **Discipline**: testo libero; si propongono prima quelle già usate, poi alcune predefinite (Allenamento, Corsa, Camminata, Forza, Palestra, Pilates, Nuoto, Bici).
- **Completare**: casella di spunta rotonda, con annulla. Un allenamento in programma in un giorno passato si mostra come **saltato**; non compare in Rimaste indietro e non va riprogrammato.
- **Today**: sezione "Allenamento" con gli allenamenti del giorno e il riepilogo della settimana ("2 di 3 · 1 h 30": fatti su totali, minuti fatti). Gli allenamenti in programma contano nel carico del giorno.
- **Calendario**: in Settimana si trascinano tra i giorni e hanno un colore proprio, arancio, con l'icona del muscolo (fatto pieno con la spunta, in programma tratteggiato, saltato grigio); in Mese un punto arancio (D64).
- **Storico**: ultime 12 settimane con il riepilogo di ognuna; si apre da Today e da Impostazioni.
- **Trasforma in allenamento**: su attività ed eventi, tranne attività ricorrenti o nate da un pasto, serie ed eventi di altri calendari.
- **Salute di Apple** (D42): sola lettura. Un allenamento registrato da iPhone o Apple Watch completa quello in programma dello stesso giorno e disciplina; se non c'è, ne crea uno già fatto. Dettagli in `technical-design.md` 9.8.
- Non incluso per ora: ripetizioni degli allenamenti.

### 7.15 Guardaroba [APPROVATO, D46–D49 e D51–D55; D69 PROPOSTA]
Si apre da Liste → Guardaroba (su desktop anche dalla barra laterale). In alto il selettore **Capi · Outfit · Idee · Numeri**; in Capi e Outfit c'è il campo di ricerca.

**Capi**
- **Aggiungere**: "Aggiungi" → foto scattata o caricata (facoltativa), nome (facoltativo), categoria. Tutto il resto sta in "Altri dettagli" e si completa quando si vuole: sottocategoria, marca, colori, stagioni, stili, occasioni, pesantezza da 1 a 5, uso a strati, materiale, preferito, stato, note.
- **Proposte dalla foto** (D54): scelta la foto di un capo nuovo, l'app propone subito i colori (al più due, senza contare lo sfondo) e, dopo un istante, categoria e tipo di capo ("stivali", "camicia", "giacca di pelle"); quando sono evidenti anche stile e materiale. Lo dice sotto la categoria: "Dalla foto: stivali, marrone". Il nome segue tipo e colore, accordati ("Stivali marroni", "Gonna nera"). Ogni proposta smette di aggiornarsi appena tocchi quel campo; svuotando il nome torna la proposta. Tutto avviene nel dispositivo: la foto non viene inviata a nessun servizio. La prima volta l'app scarica il riconoscimento (circa 40 MB, una volta sola), poi funziona anche senza rete; se non riesce a scaricarlo restano i colori e la scelta a mano.
- **Colori**: nero, bianco, grigio, beige, marrone, blu, azzurro, verde, giallo, arancione, rosso, bordeaux, rosa, lilla, oro, argento, altro. Oro e argento non vengono mai proposti dalla foto (in foto sono giallo e grigio): li scegli tu. Nelle Idee il marrone conta tra i colori neutri.
- **Classificazione assistita**: stagioni, stili, occasioni, pesantezza e uso a strati vengono proposti dalla categoria e dalle parole del nome ("cappotto", "pizzo"…), con regole locali. Si correggono liberamente; dopo una correzione il sistema non le riscrive.
- **Stagionalità**: stagioni e pesantezza sono indicazioni, mai vincoli. Nessun capo viene escluso per la stagione.
- **Prima i capi di stagione** (D65): nel catalogo e nella scelta dei capi per un outfit vengono prima i capi di stagione (o senza stagioni indicate); gli altri sono sotto "Fuori stagione · N", a un tocco. Nei quindici giorni a cavallo del cambio valgono entrambe le stagioni. Con la ricerca o il filtro per stagione si vede tutto insieme.
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

**Lavatrici** (D69)
- **Gruppo di lavaggio**: nella scheda del capo, "Lavaggio": Auto · Scuri · Chiari · Colorati · Delicati. Con Auto sotto si legge cosa propone l'app ("Dai colori e dal materiale: scuri."). Senza colori né materiale il capo resta "Senza gruppo". Scarpe e borse non hanno gruppo e non contano.
- **Da lavare**: sopra il catalogo, i gruppi con il numero di capi da lavare ("Scuri 7 · Chiari 3"); un tocco mostra solo quei capi, un altro tocco toglie il filtro. Anche tra i filtri c'è "Lavaggio".
- **Proposta**: "Lavatrice degli scuri · entro mercoledì", con il perché: "Serve giovedì: Maglia bianca", "Restano 2 top puliti", "7 capi: un carico pieno". Prima le urgenti, poi i gruppi più pieni.
- **Fatta** apre "Quali capi tornano puliti?": i capi da lavare del gruppo già spuntati e, sotto, quelli indossati dello stesso gruppo da aggiungere. Con una lavatrice già in programma, Fatta completa quell'attività.
- **Pianifica**: giorno (Oggi, Domani, dopodomani o una data) e ora facoltativa, con la previsione del giorno. Nasce un'attività "Lavatrice scuri"; se il giorno scelto viene dopo quello in cui serve il capo, lo dice. La proposta poi mostra "In programma sabato".
- **Non ora**: la proposta si nasconde su questo dispositivo e torna quando il gruppo ha più capi. Le urgenti restano.
- **Attività**: completare una lavatrice da Oggi, Settimana, Mese o dalla ricerca apre lo stesso elenco. Vale anche per le attività scritte a mano con "lavatrice", "bucato" o "lavaggio" nel titolo: il gruppo si legge dalle parole (scuri/neri, chiari/bianchi, colorati, delicati/lana/a mano); senza gruppo si vedono tutti i capi da lavare, nessuno già spuntato. Il toast "N capi di nuovo puliti" ha Annulla. Se nel guardaroba non c'è nessun capo da scegliere, l'elenco non si apre.
- **Oggi**: la sezione "Lavatrice" compare solo se un capo da lavare serve oggi o domani e non c'è una lavatrice in programma in tempo, con Fatta e Pianifica.
- **Storico**: ogni lavatrice fatta resta registrata (giorno, gruppo, capi): serve ad annullare e a imparare quanti capi fanno un carico.

**Offline**: capi, outfit e utilizzi si leggono e si modificano senza rete; solo il caricamento della foto la richiede.

**Idee** (D49)
- **Per oggi**: proposte ordinate per pertinenza, tre alla volta; "Altre idee" mostra le successive. Si può indicare l'occasione e che tempo fa (Meteo · Freddo · Mite · Caldo; senza città o senza previsione la prima voce è Stagione).
- **Meteo** (D55): con una città nelle Impostazioni, le idee partono dalla previsione di oggi, mostrata sotto la scelta ("Milano, oggi: 9–16°, coperto. Conta come mite."). La fascia viene dalla temperatura percepita: freddo sotto 12°, caldo da 22°, contando le ore calde il doppio della minima. Freddo, Mite e Caldo restano per decidere a mano. Senza città compare il collegamento alle Impostazioni.
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
- **Meteo** (D55): scegliendo il giorno, "Pianifica" mostra la previsione per quel giorno; oltre i 16 giorni dice che non è ancora disponibile. In "In programma" ogni outfit riporta la previsione del suo giorno. Se i capi dichiarano la pesantezza e l'outfit stona ("Forse leggero per una giornata fredda"), viene segnalato; la scelta non cambia da sola. La pioggia viene mostrata, non entra nel voto.
- **Oggi**: nel giorno pianificato compare la sezione "Outfit" con le foto dei capi; un tocco porta al Guardaroba.
- **Capi non disponibili**: "Un capo è da lavare" o "Un capo non è più nel guardaroba" compaiono sulla pianificazione; la scelta resta com'è finché non la cambi tu.
- Se l'outfit salvato viene modificato, la pianificazione mostra i capi nuovi; se viene eliminato, restano quelli del momento in cui è stato pianificato.

**Wishlist** (D52)
- **Articolo di abbigliamento**: nella scheda di un articolo della Wishlist, "È un capo di abbigliamento" apre tipo di capo (proposto dal nome), colori e stili. Sono facoltativi; la categoria a testo libero resta com'è.
- **Nel guardaroba**: sotto quei campi compare il confronto con ciò che possiedi: "Hai già qualcosa di simile" (stesso tipo, un colore in comune), "Si abbinerebbe con" (capi di tipi complementari con colori in armonia, prima quelli dello stesso stile), "Completerebbe questi outfit" (outfit salvati a cui manca quel tipo di capo).
- **Solo dati presenti**: senza il tipo di capo o senza i colori il confronto non azzarda nulla e dice cosa manca; i capi del guardaroba senza colori non vengono proposti come abbinamento.
- **Dall'acquisto al capo**: su un articolo in Acquistati, "Salva e aggiungi al guardaroba" crea il capo con nome, marca, tipo, colori, stili, note e l'immagine del negozio (finché non scatti una foto tua). Stagioni, occasioni e pesantezza sono proposte come per ogni capo nuovo. Se l'articolo è già nel guardaroba, la scheda lo dice.

**Numeri** (D53)
- In alto: quanti capi, quanti outfit, quanti capi indossati negli ultimi 30 giorni.
- **I più indossati** e **Outfit più indossati**: i primi cinque, con numero di volte e ultima volta.
- **Mai indossati**, **Fermi da più di due mesi**, **Mai abbinati** (in nessun outfit salvato e mai indossati insieme ad altri capi): i primi otto, poi "e altri N".
- Un tocco su un capo o un outfit lo apre. Nella scheda di ogni capo compare "Indossato N volte · ultima volta…".
- I numeri contano solo gli utilizzi registrati con "Indossato oggi", e la vista dice da quando.

Non incluso per ora: idee per un giorno diverso da oggi, meteo in Oggi e nel calendario, posizione del telefono, capi adatti alla pioggia, motivazione facoltativa quando si scarta, regolazione dei pesi dall'interfaccia, outfit pianificati dentro Settimana e Mese o nella scheda dell'evento, proposta automatica "aggiungi al guardaroba" al momento dell'acquisto, tipo di capo e colori letti dal link, grafici e andamento nel tempo.

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
