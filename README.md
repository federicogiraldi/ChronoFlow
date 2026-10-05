# ChronoFlow

Calendario e promemoria personale. Funziona nel browser, si installa su telefono e computer come app (PWA) e resta consultabile anche offline.

- **Backend:** Node.js 22, Express 5, database SQLite (file locale) oppure [Turso](https://turso.tech) (SQLite in cloud)
- **Frontend:** HTML, CSS e JavaScript (moduli ES), senza framework né passaggio di build

## Funzionalità

- **Calendario** con vista mese, settimana e giorno, bottone "Oggi", giorno corrente evidenziato e swipe su mobile per cambiare periodo
- **Eventi:**
  - creazione, modifica, duplicazione ed eliminazione
  - eventi su più giorni e di tutto il giorno
  - colore, categoria e descrizione
  - ripetizione giornaliera, settimanale, mensile o annuale, con data di fine opzionale
- **Promemoria:**
  - scadenza (data o data e ora) e priorità
  - completamento salvato, scaduti evidenziati, badge con quelli in scadenza
  - "Elimina completati" e filtro per mostrare o nascondere i completati
- **Ricerca** per testo e **filtro** per categoria
- **Notifiche** del browser con preavviso configurabile per eventi e scadenze dei promemoria
- **Import ed export `.ics`**, compatibile con Google Calendar, Apple Calendario e Outlook
- **Tema** chiaro, scuro o automatico
- **PWA:** installabile e consultabile offline
- **Accesso protetto da password**, opzionale e pensato per uso personale
- **Accessibilità:** dialog nativi (si chiudono con Esc e gestiscono il focus), etichette per gli screen reader e scorciatoie da tastiera

### Scorciatoie da tastiera

| Tasto   | Azione                          |
| ------- | ------------------------------- |
| `←` `→` | Periodo precedente / successivo |
| `t`     | Oggi                            |
| `n`     | Nuovo evento                    |
| `m`     | Vista mese                      |
| `s`     | Vista settimana                 |
| `g`     | Vista giorno                    |
| `/`     | Cerca                           |
| `Esc`   | Chiude finestre e pannelli      |

## Avvio in locale

Serve **Node.js 22** o superiore.

```bash
npm install
npm run dev        # avvio con riavvio automatico a ogni modifica
# oppure
npm start
```

Apri <http://localhost:3000>. All'avvio il terminale mostra anche l'indirizzo per aprire l'app dal telefono sulla stessa rete Wi-Fi.

I dati sono salvati in `backend/chronoflow.db`. Un database della v1.0 viene aggiornato automaticamente, senza perdere dati.

### Configurazione

Copia `.env.example` in `.env` e modifica i valori che ti servono. Il file `.env` viene letto automaticamente da `npm start` e da `npm run dev`.

| Variabile             | Default                      | Descrizione                                                      |
| --------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `PORT`                | `3000`                       | Porta del server                                                 |
| `HOST`                | `0.0.0.0`                    | `0.0.0.0` rende l'app raggiungibile dalla rete di casa           |
| `DATABASE_URL`        | file `backend/chronoflow.db` | URL del database (`file:...` oppure `libsql://...` di Turso)     |
| `DATABASE_AUTH_TOKEN` | –                            | Token di Turso                                                   |
| `APP_PASSWORD`        | vuota (nessun login)         | Password per accedere all'app                                    |
| `SESSION_SECRET`      | derivato dalla password      | Chiave casuale per firmare il cookie di sessione                 |
| `SESSION_DAYS`        | `30`                         | Durata della sessione                                            |
| `NODE_ENV`            | –                            | `production` attiva cookie Secure, HSTS e risorse solo via https |

> ⚠️ **Senza `APP_PASSWORD` chiunque raggiunga il server può leggere e modificare i dati.** Lasciala vuota solo per l'uso sul tuo computer o nella rete di casa.

## Script

| Comando            | Cosa fa                                                   |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Server di sviluppo con riavvio automatico                 |
| `npm start`        | Server di produzione                                      |
| `npm test`         | Test unitari e delle API                                  |
| `npm run test:e2e` | Test end-to-end nel browser (Playwright)                  |
| `npm run lint`     | Controllo del codice (ESLint)                             |
| `npm run format`   | Formattazione automatica (Prettier)                       |
| `npm run check`    | Lint, formattazione e test, gli stessi controlli della CI |

Per i test end-to-end la prima volta installa il browser con `npx playwright install chromium`.

## Pubblicazione gratuita: Vercel + Turso

Tutti e due i servizi hanno un piano gratuito che basta per un uso personale.

- **Turso** ospita il database: è SQLite in cloud, quindi lo stesso codice gira in locale e online.
- **Vercel** serve il frontend dalla sua CDN e le API come funzione serverless.

Il file `vercel.json` è già configurato.

> Perché non un database su file? Su Vercel, e sui piani gratuiti di servizi come Render, il disco viene azzerato a ogni riavvio: i dati andrebbero persi. Turso evita il problema.

### 1. Crea il database su Turso

1. Registrati su <https://turso.tech>. Il piano gratuito non richiede la carta di credito.
2. Crea un database (ad esempio `chronoflow`) nella regione più vicina, ad esempio Francoforte.
3. Dalla pagina del database copia:
   - l'**URL** (`libsql://chronoflow-<utente>.turso.io`), che diventa `DATABASE_URL`
   - un **token** creato con "Create token", che diventa `DATABASE_AUTH_TOKEN`

Le tabelle vengono create in automatico alla prima richiesta.

### 2. Pubblica su Vercel

1. Registrati su <https://vercel.com> con il tuo account GitHub. Il piano gratuito è "Hobby".
2. Scegli **Add New → Project** e importa il repository `ChronoFlow`. Le impostazioni sono già nel file `vercel.json`, non serve cambiare nulla.
3. In **Environment Variables** aggiungi:
   - `DATABASE_URL`: l'URL di Turso
   - `DATABASE_AUTH_TOKEN`: il token di Turso
   - `APP_PASSWORD`: la password che userai per entrare
   - `SESSION_SECRET`: una stringa casuale lunga, ad esempio il risultato di `openssl rand -hex 32`
   - `NODE_ENV`: `production`
4. Premi **Deploy**. A ogni push sul branch principale Vercel ripubblica l'app da solo.

### 3. Installa l'app sul telefono

Apri l'indirizzo `https://<progetto>.vercel.app`:

- **iPhone (Safari):** Condividi → "Aggiungi alla schermata Home"
- **Android (Chrome):** menu ⋮ → "Installa app"

Poi attiva le notifiche dal menu ⋮ dell'app.

### Portare i dati locali online

Dall'app locale usa **⋮ → Esporta calendario (.ics)**, poi **⋮ → Importa calendario (.ics)** nell'app online. I promemoria non fanno parte del formato `.ics`.

### Backup

- **Da Turso:** usa la funzione di export della dashboard, oppure la CLI con `turso db shell chronoflow .dump > backup.sql`.
- **Database locale:** basta copiare il file `backend/chronoflow.db`.
- **Calendario:** l'export `.ics` funziona anche come backup.

## Limiti noti

- **Notifiche:** arrivano solo mentre l'app è aperta, anche in background o installata come PWA. Le notifiche con app chiusa richiederebbero un servizio push e uno scheduler, che non fanno parte del piano gratuito usato qui.
- **Fuso orario:** gli orari sono salvati come ora locale, senza fuso, il che va bene per un uso personale in un solo fuso orario.
- **Ripetizioni:** modifiche ed eliminazioni valgono per tutta la serie. Le regole complesse dei file `.ics` (ad esempio "ogni 2 settimane") vengono importate come evento singolo, con un avviso.

## API

Tutte le risposte sono in JSON. Gli errori hanno la forma `{ "error": "messaggio", "details": { "campo": "messaggio" } }`. Se `APP_PASSWORD` è impostata, tutte le rotte tranne `/api/health` e `/api/auth/*` richiedono il login.

| Metodo   | Rotta                      | Descrizione                                                                        |
| -------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `GET`    | `/api/health`              | Stato del server e del database                                                    |
| `GET`    | `/api/auth/status`         | `{ authRequired, authenticated }`                                                  |
| `POST`   | `/api/auth/login`          | `{ password }`: imposta il cookie di sessione                                      |
| `POST`   | `/api/auth/logout`         | Esce                                                                               |
| `GET`    | `/api/events`              | Tutti gli eventi; con `?from=YYYY-MM-DD&to=YYYY-MM-DD` solo quelli dell'intervallo |
| `GET`    | `/api/events/:id`          | Un evento                                                                          |
| `POST`   | `/api/events`              | Crea un evento                                                                     |
| `PUT`    | `/api/events/:id`          | Modifica un evento (tutta la serie, se si ripete)                                  |
| `DELETE` | `/api/events/:id`          | Elimina un evento                                                                  |
| `POST`   | `/api/events/import`       | `{ events: [...] }`: importazione in blocco, massimo 2000 eventi                   |
| `GET`    | `/api/reminders`           | Promemoria, ordinati per stato, scadenza e priorità                                |
| `POST`   | `/api/reminders`           | Crea un promemoria                                                                 |
| `PATCH`  | `/api/reminders/:id`       | Aggiorna titolo, scadenza, priorità o completamento                                |
| `DELETE` | `/api/reminders/:id`       | Elimina un promemoria                                                              |
| `DELETE` | `/api/reminders/completed` | Elimina tutti i promemoria completati                                              |

**Campi di un evento:**

- `title`: obbligatorio, massimo 200 caratteri
- `start_datetime` e `end_datetime`: `YYYY-MM-DDTHH:MM`, oppure `YYYY-MM-DD` per gli eventi di tutto il giorno
- `all_day`
- `description`: massimo 2000 caratteri
- `category`: massimo 50 caratteri
- `color`: `#rrggbb`
- `recurrence`: `none`, `daily`, `weekly`, `monthly` o `yearly`
- `recurrence_until`: `YYYY-MM-DD`
- `notify_minutes`: da 0 a 10080

**Campi di un promemoria:**

- `title`
- `due_date`: `YYYY-MM-DD` oppure `YYYY-MM-DDTHH:MM`
- `priority`: `low`, `medium` o `high`
- `is_completed`

## Struttura del progetto

```
api/index.js            Punto di ingresso per Vercel
backend/
  app.js                Applicazione Express (sicurezza, rotte, gestione errori)
  server.js             Avvio del server locale
  config.js             Configurazione da variabili d'ambiente
  db.js                 Connessione al database e migrazioni
  auth.js               Login con password e cookie firmato
  validation.js         Validazione dei dati in ingresso
  routes/               Rotte di eventi e promemoria
frontend/
  index.html, style.css
  sw.js                 Service worker (offline)
  manifest.webmanifest  Manifest della PWA
  js/                   Moduli: main, calendar, reminders, dates, recurrence,
                        ics, notifications, theme, api, ui
test/
  unit/                 Test delle funzioni pure
  api/                  Test delle API (supertest)
  e2e/                  Test nel browser (Playwright)
scripts/                Generazione icone e server per i test E2E
```
