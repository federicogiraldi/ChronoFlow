// Connessione al database tramite @libsql/client.
// Funziona sia con un file SQLite locale (file:...) sia con Turso (libsql://...),
// così lo stesso codice gira in locale e in produzione.
// Per i database online (Turso) usiamo il client "web", che comunica via HTTPS e non ha
// componenti nativi: su Vercel il modulo nativo potrebbe non essere incluso nel pacchetto.
// Il client completo (con SQLite nativo) serve solo per i file locali.
export function createDb({ url, authToken }) {
    const local = url.startsWith('file:') || url === ':memory:';
    const client = (local ? import('@libsql/client') : import('@libsql/client/web')).then((m) =>
        m.createClient({ url, authToken })
    );
    return {
        execute: async (statement) => (await client).execute(statement),
        batch: async (statements, mode) => (await client).batch(statements, mode),
        close: () => client.then((c) => c.close()),
    };
}

// Migrazioni dello schema, applicate in ordine una sola volta.
// La versione corrente è salvata nella tabella schema_migrations.
// NON modificare migrazioni già rilasciate: aggiungerne sempre di nuove in coda.
const MIGRATIONS = [
    // 1: schema della v1.0 (CREATE IF NOT EXISTS: compatibile con i database già esistenti)
    [
        `CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT NOT NULL,
            color TEXT DEFAULT '#3788d8',
            category TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due_date TEXT,
            priority TEXT DEFAULT 'medium',
            is_completed INTEGER DEFAULT 0
        )`,
    ],
    // 2: eventi di tutto il giorno, ricorrenze, notifiche, indici
    [
        `ALTER TABLE events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'`,
        `ALTER TABLE events ADD COLUMN recurrence_until TEXT`,
        `ALTER TABLE events ADD COLUMN notify_minutes INTEGER`,
        `ALTER TABLE reminders ADD COLUMN created_at TEXT`,
        `CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_datetime)`,
        `CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (due_date)`,
    ],
    // 3: notifiche push (dispositivi iscritti e avvisi già inviati)
    [
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS notifications_sent (
            key TEXT PRIMARY KEY,
            sent_at INTEGER NOT NULL
        )`,
    ],
    // 4: categorie con colore fisso. Le categorie esistenti nascono dagli eventi (con il loro
    // colore più usato) e da qui in poi il colore di un evento è sempre quello della sua categoria.
    [
        `CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            color TEXT NOT NULL
        )`,
        `INSERT OR IGNORE INTO categories (name, color)
         SELECT TRIM(category), color FROM (
             SELECT category, color, COUNT(*) AS n FROM events
             WHERE category IS NOT NULL AND TRIM(category) != ''
             GROUP BY category, color
             ORDER BY n DESC
         )`,
        `UPDATE events SET
             category = (SELECT c.name FROM categories c WHERE c.name = TRIM(events.category)),
             color = (SELECT c.color FROM categories c WHERE c.name = TRIM(events.category))
         WHERE category IS NOT NULL AND TRIM(category) != ''`,
        `UPDATE events SET category = NULL, color = '#3788d8' WHERE category IS NULL OR TRIM(category) = ''`,
    ],
];

export async function migrate(db) {
    await db.execute(
        `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
    );
    const current = await currentVersion(db);

    for (let i = current; i < MIGRATIONS.length; i++) {
        const version = i + 1;
        // Ogni migrazione è atomica: o vengono applicate tutte le sue istruzioni o nessuna.
        try {
            await db.batch(
                [
                    ...MIGRATIONS[i],
                    {
                        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
                        args: [version, new Date().toISOString()],
                    },
                ],
                'write'
            );
        } catch (error) {
            // Due istanze serverless avviate insieme possono tentare la stessa migrazione:
            // se nel frattempo l'ha applicata l'altra, proseguiamo.
            if ((await currentVersion(db)) < version) throw error;
        }
    }
    return MIGRATIONS.length;
}

async function currentVersion(db) {
    const { rows } = await db.execute('SELECT MAX(version) AS v FROM schema_migrations');
    return Number(rows[0]?.v ?? 0);
}
