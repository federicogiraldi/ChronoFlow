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
    console.error('Errore non gestito:', err);
    res.status(500).json({ error: 'Errore interno del server' });
}
