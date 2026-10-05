// Errore HTTP con codice di stato e, opzionalmente, i dettagli di validazione per campo.
export class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

// Middleware finale: trasforma qualsiasi errore in una risposta JSON coerente
// { error: "messaggio", details?: { campo: "messaggio" } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    // JSON malformato o corpo troppo grande (errori generati da express.json)
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON non valido' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Richiesta troppo grande' });
    }
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, details: err.details });
    }
    const dbError = databaseErrorMessage(err);
    if (dbError) {
        console.error(`Database: ${dbError}`, err);
        return res.status(503).json({ error: dbError });
    }
    console.error('Errore non gestito:', err);
    res.status(500).json({ error: 'Errore interno del server' });
}

// Errori di connessione al database (Turso) tradotti in un messaggio utile per capire cosa correggere
export function databaseErrorMessage(err) {
    const status = err?.cause?.status ?? err?.status;
    if (
        err?.code === 'SERVER_ERROR' &&
        status === 401 &&
        !process.env.DATABASE_AUTH_TOKEN &&
        !process.env.TURSO_AUTH_TOKEN
    ) {
        return 'Il database ha rifiutato l’accesso: la variabile DATABASE_AUTH_TOKEN non è impostata';
    }
    if (err?.code === 'SERVER_ERROR' && (status === 401 || status === 403)) {
        return 'Il database ha rifiutato l’accesso: controlla DATABASE_AUTH_TOKEN (token valido, permessi di scrittura)';
    }
    if (err?.code === 'SERVER_ERROR' && status === 404) {
        return 'Database non trovato: controlla DATABASE_URL';
    }
    const cause = err?.cause?.code ?? err?.code;
    if (['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(cause)) {
        return 'Database non raggiungibile in questo momento: riprova tra poco';
    }
    return null;
}
