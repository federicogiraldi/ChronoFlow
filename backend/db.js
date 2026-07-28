// Importiamo la libreria better-sqlite3 e il modulo path
const Database = require('better-sqlite3');
const path = require('path');

// Definiamo il percorso dove verrà salvato il file del database
// __dirname indica la cartella corrente (backend)
const dbPath = path.join(__dirname, 'chronoflow.db');

// Inizializziamo la connessione.
// Se il file chronoflow.db non esiste, better-sqlite3 lo creerà automaticamente.
const db = new Database(dbPath, { 
    // Attivando verbose, vedremo nel terminale tutte le query SQL eseguite (utile per il debug)
    verbose: console.log 
});

// Funzione per creare le tabelle se non esistono già
function initDB() {
    console.log('🔄 Inizializzazione del database in corso...');

    // Query SQL per la tabella EVENTI del Calendario
    const createEventsTable = `
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT NOT NULL,
            color TEXT DEFAULT '#3788d8',
            category TEXT
        )
    `;

    // Query SQL per la tabella PROMEMORIA
    // is_completed è un intero perché SQLite non ha un tipo booleano nativo (0 = falso, 1 = vero)
    const createRemindersTable = `
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due_date TEXT,
            priority TEXT DEFAULT 'medium',
            is_completed INTEGER DEFAULT 0
        )
    `;

    // Eseguiamo le query in modo sincrono
    db.exec(createEventsTable);
    db.exec(createRemindersTable);

    console.log('✅ Tabelle del database pronte e verificate.');
}

// Esportiamo la connessione al db e la funzione di inizializzazione
// per poterle usare in altri file (come server.js)
module.exports = {
    db,
    initDB
};