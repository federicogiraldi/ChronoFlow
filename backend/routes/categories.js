import express from 'express';
import { HttpError } from '../errors.js';
import { parseId } from '../validation.js';
import { validateCategory } from '../categories.js';

export function categoriesRouter(categories) {
    const router = express.Router();

    function idOrThrow(raw) {
        const id = parseId(raw);
        if (!id) throw new HttpError(400, 'Id non valido');
        return id;
    }

    function validateOrThrow(body, options) {
        const { value, errors } = validateCategory(body, options);
        if (errors) throw new HttpError(400, 'Dati della categoria non validi', errors);
        return value;
    }

    router.get('/', async (req, res) => {
        res.json(await categories.list());
    });

    router.post('/', async (req, res) => {
        res.status(201).json(await categories.create(validateOrThrow(req.body)));
    });

    // Rinomina e/o cambia colore: anche gli eventi della categoria vengono aggiornati
    router.patch('/:id', async (req, res) => {
        const changes = validateOrThrow(req.body, { partial: true });
        res.json(await categories.update(idOrThrow(req.params.id), changes));
    });

    router.delete('/:id', async (req, res) => {
        await categories.remove(idOrThrow(req.params.id));
        res.status(204).end();
    });

    return router;
}
