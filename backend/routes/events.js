import express from 'express';
import { HttpError } from '../errors.js';
import { normalizeDate, parseId, validateEvent } from '../validation.js';

const COLUMNS = [
    'title',
    'description',
    'start_datetime',
    'end_datetime',
    'all_day',
    'color',
    'category',
    'recurrence',
    'recurrence_until',
    'notify_minutes',
];
const MAX_IMPORT = 2000;

// Converte una riga del database nell'oggetto restituito dall'API
function toEvent(row) {
    return {
        id: Number(row.id),
        title: row.title,
        description: row.description ?? null,
        start_datetime: row.start_datetime,
        end_datetime: row.end_datetime,
        all_day: Boolean(row.all_day),
        color: row.color,
        category: row.category ?? null,
        recurrence: row.recurrence,
        recurrence_until: row.recurrence_until ?? null,
        notify_minutes: row.notify_minutes === null ? null : Number(row.notify_minutes),
    };
}

function validateOrThrow(body) {
    const { value, errors } = validateEvent(body);
    if (errors) throw new HttpError(400, 'Dati dell’evento non validi', errors);
    return value;
}

function insertStatement(event) {
    return {
        sql: `INSERT INTO events (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
        args: COLUMNS.map((c) => event[c]),
    };
}

export function eventsRouter(db) {
    const router = express.Router();

    async function findEvent(rawId) {
        const id = parseId(rawId);
        if (!id) throw new HttpError(400, 'Id non valido');
        const { rows } = await db.execute({ sql: 'SELECT * FROM events WHERE id = ?', args: [id] });
        if (!rows.length) throw new HttpError(404, 'Evento non trovato');
        return toEvent(rows[0]);
    }

    // GET /api/events[?from=YYYY-MM-DD&to=YYYY-MM-DD]
    // Con from/to restituisce solo gli eventi (e le serie ricorrenti) che toccano l'intervallo.
    router.get('/', async (req, res) => {
        const { from, to } = req.query;
        if (from === undefined && to === undefined) {
            const { rows } = await db.execute('SELECT * FROM events ORDER BY start_datetime, id');
            return res.json(rows.map(toEvent));
        }
        const fromDate = normalizeDate(from);
        const toDate = normalizeDate(to);
        if (!fromDate || !toDate || toDate < fromDate) {
            throw new HttpError(400, 'Parametri from/to non validi (YYYY-MM-DD)');
        }
        const { rows } = await db.execute({
            sql: `SELECT * FROM events
                  WHERE substr(start_datetime, 1, 10) <= :to
                    AND (
                      (recurrence = 'none' AND substr(end_datetime, 1, 10) >= :from)
                      OR (recurrence != 'none' AND (recurrence_until IS NULL OR recurrence_until >= :from))
                    )
                  ORDER BY start_datetime, id`,
            args: { from: fromDate, to: toDate },
        });
        res.json(rows.map(toEvent));
    });

    router.get('/:id', async (req, res) => {
        res.json(await findEvent(req.params.id));
    });

    router.post('/', async (req, res) => {
        const event = validateOrThrow(req.body);
        const info = await db.execute(insertStatement(event));
        res.status(201).json({ id: Number(info.lastInsertRowid), ...event, all_day: Boolean(event.all_day) });
    });

    // Importazione in blocco (usata dall'import .ics): salva gli eventi validi e
    // restituisce l'elenco di quelli scartati con il motivo
    router.post('/import', async (req, res) => {
        const list = req.body?.events;
        if (!Array.isArray(list) || list.length === 0) {
            throw new HttpError(400, 'Nessun evento da importare');
        }
        if (list.length > MAX_IMPORT) {
            throw new HttpError(400, `Massimo ${MAX_IMPORT} eventi per importazione`);
        }
        const valid = [];
        const invalid = [];
        list.forEach((item, index) => {
            const { value, errors } = validateEvent(item);
            if (errors) invalid.push({ index, title: item?.title ?? null, errors });
            else valid.push(value);
        });
        if (valid.length) await db.batch(valid.map(insertStatement), 'write');
        res.status(201).json({ imported: valid.length, skipped: invalid.length, invalid });
    });

    // Modifica completa di un evento (per gli eventi ricorrenti vale per tutta la serie)
    router.put('/:id', async (req, res) => {
        const existing = await findEvent(req.params.id);
        const event = validateOrThrow(req.body);
        await db.execute({
            sql: `UPDATE events SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            args: [...COLUMNS.map((c) => event[c]), existing.id],
        });
        res.json({ id: existing.id, ...event, all_day: Boolean(event.all_day) });
    });

    router.delete('/:id', async (req, res) => {
        const existing = await findEvent(req.params.id);
        await db.execute({ sql: 'DELETE FROM events WHERE id = ?', args: [existing.id] });
        res.status(204).end();
    });

    return router;
}
