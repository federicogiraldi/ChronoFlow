import express from 'express';
import { HttpError } from '../errors.js';
import { parseId, validateReminder } from '../validation.js';

function toReminder(row) {
    return {
        id: Number(row.id),
        title: row.title,
        due_date: row.due_date ?? null,
        priority: row.priority ?? 'medium',
        is_completed: Boolean(row.is_completed),
        created_at: row.created_at ?? null,
    };
}

export function remindersRouter(db) {
    const router = express.Router();

    async function findReminder(rawId) {
        const id = parseId(rawId);
        if (!id) throw new HttpError(400, 'Id non valido');
        const { rows } = await db.execute({ sql: 'SELECT * FROM reminders WHERE id = ?', args: [id] });
        if (!rows.length) throw new HttpError(404, 'Promemoria non trovato');
        return toReminder(rows[0]);
    }

    function validateOrThrow(body, options) {
        const { value, errors } = validateReminder(body, options);
        if (errors) throw new HttpError(400, 'Dati del promemoria non validi', errors);
        return value;
    }

    // Ordine: prima i non completati, poi per scadenza (senza scadenza in fondo), poi priorità
    router.get('/', async (req, res) => {
        const { rows } = await db.execute(`
            SELECT * FROM reminders
            ORDER BY is_completed,
                     due_date IS NULL, due_date,
                     CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                     id`);
        res.json(rows.map(toReminder));
    });

    router.post('/', async (req, res) => {
        const reminder = validateOrThrow(req.body);
        const createdAt = new Date().toISOString();
        const info = await db.execute({
            sql: `INSERT INTO reminders (title, due_date, priority, is_completed, created_at)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [reminder.title, reminder.due_date, reminder.priority, reminder.is_completed, createdAt],
        });
        const { rows } = await db.execute({
            sql: 'SELECT * FROM reminders WHERE id = ?',
            args: [Number(info.lastInsertRowid)],
        });
        res.status(201).json(toReminder(rows[0]));
    });

    // Aggiornamento parziale: titolo, scadenza, priorità e/o completamento
    router.patch('/:id', async (req, res) => {
        const existing = await findReminder(req.params.id);
        const changes = validateOrThrow(req.body, { partial: true });
        const keys = Object.keys(changes);
        await db.execute({
            sql: `UPDATE reminders SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
            args: [...keys.map((k) => changes[k]), existing.id],
        });
        res.json(await findReminder(existing.id));
    });

    // Elimina tutti i promemoria completati
    router.delete('/completed', async (req, res) => {
        const info = await db.execute('DELETE FROM reminders WHERE is_completed = 1');
        res.json({ deleted: info.rowsAffected });
    });

    router.delete('/:id', async (req, res) => {
        const existing = await findReminder(req.params.id);
        await db.execute({ sql: 'DELETE FROM reminders WHERE id = ?', args: [existing.id] });
        res.status(204).end();
    });

    return router;
}
