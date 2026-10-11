# Backup automatico

Ogni notte una GitHub Action salva una copia cifrata del database in un repository privato separato
(technical-design.md, sezione 10). Il piano Free di Supabase non offre backup scaricabili: questa è la copia
fuori da Supabase.

Il file `backup.yml` di questa cartella è il modello del workflow. **Non gira da qui**: va copiato nel
repository dei backup, che Bibi crea una volta sola seguendo i passi qui sotto.

> Stato: il workflow è stato scritto ma non ancora eseguito, e il ripristino non è stato provato.
> Dopo la configurazione va lanciato a mano una volta (passo 6) e va provato almeno un ripristino.

## Configurazione (una volta)

1. **Crea un repository privato** su GitHub, per esempio `life-planner-backup`.
2. **Genera la coppia di chiavi** sul tuo computer ([age](https://github.com/FiloSottile/age), `brew install age`):

   ```bash
   age-keygen -o planner-backup.key
   ```

   Il comando stampa la chiave pubblica (`age1…`). Il file `planner-backup.key` è la **chiave privata**:
   conservala nel gestore di password e in una seconda copia sicura. Non va in nessun repository e non va
   data a GitHub. Senza quella chiave i backup non si possono leggere, nemmeno da te.
3. Nel repository dei backup crea il file `age-recipient.txt` con dentro **solo la chiave pubblica** (`age1…`).
4. Copia `backup/backup.yml` di questo repository in `.github/workflows/backup.yml` del repository dei backup.
5. **Aggiungi il segreto** `SUPABASE_DB_URL` (Settings → Secrets and variables → Actions → New repository secret)
   con la stringa di connessione del progetto `life-planner`.
   - In Supabase: Connect → **Session pooler** (porta 5432). La connessione diretta usa solo IPv6, che i
     runner di GitHub non hanno.
   - Ha la forma `postgresql://postgres.<ref>:<password>@aws-0-<regione>.pooler.supabase.com:5432/postgres`.
   - La password è quella del database (Project Settings → Database). Se non la ricordi va reimpostata lì.
6. Lancia il workflow a mano (Actions → Backup notturno → Run workflow) e controlla che in `backups/`
   compaia `planner-AAAA-MM-GG.sql.age`.

## Cosa contiene

- Lo schema `public`: struttura e dati di tutte le tabelle dell'app.
- **Non** contiene: l'utente di accesso (`auth`), i segreti in Vault (credenziali iCloud, feed imayoga,
  chiavi delle notifiche) e i token Google. Dopo un ripristino i calendari vanno ricollegati.
- Restano gli ultimi 30 file. Quelli più vecchi escono dalla cartella ma restano nella storia di git, cifrati.

## Leggere un backup

```bash
age --decrypt --identity planner-backup.key backups/planner-2026-10-11.sql.age > planner.sql
```

`planner.sql` è in chiaro e contiene tutto, comprese le registrazioni riservate: cancellalo quando hai finito.

## Ripristino (traccia, non ancora provata)

1. Crea un nuovo progetto Supabase e accedi all'app una volta, così esiste un utente.
2. Le righe appartengono all'utente di prima (`owner_id`). L'id del vecchio utente è in `profiles.owner_id`
   dentro il dump; quello nuovo è diverso. Prima di caricare i dati va sostituito il vecchio id con il nuovo
   nel file `planner.sql` (è un UUID, basta un trova-e-sostituisci).
3. Svuota lo schema `public` del progetto nuovo e carica il dump:

   ```bash
   psql "<stringa di connessione del nuovo progetto>" -f planner.sql
   ```

4. Riconfigura ciò che il dump non contiene: segreti in Vault, cron delle notifiche, calendari collegati.

Per un recupero parziale (una registrazione cancellata per errore) basta cercare nel file `planner.sql`.

## Se smette di funzionare

- GitHub manda una mail a ogni esecuzione fallita.
- Dopo 60 giorni senza attività nel repository GitHub sospende i workflow pianificati; qui non succede finché
  il backup riesce, perché ogni notte c'è un commit. Se fallisce a lungo, va riattivato da Actions.
- Cambiando la password del database va aggiornato il segreto `SUPABASE_DB_URL`.
