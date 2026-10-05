// Categorie degli eventi: ognuna ha un colore fisso, così il colore di un evento
// dipende solo dalla sua categoria e non può essere scelto per sbaglio.
import { HttpError } from './errors.js';
import { DEFAULT_COLOR } from './validation.js';

// Colori assegnati in automatico alle nuove categorie (il blu è quello degli eventi senza categoria)
export const PALETTE = [
    '#2e9e6b',
    '#8e5bd6',
    '#e8a33d',
    '#d9534f',
    '#d6569b',
    '#2aa5b8',
    '#6c757d',
    '#3788d8',
];
export const NO_CATEGORY_COLOR = DEFAULT_COLOR;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function toCategory(row) {
    return {
        id: Number(row.id),
        name: row.name,
        color: row.color,
        events: row.events === undefined ? undefined : Number(row.events),
    };
}

// Primo colore della tavolozza non ancora usato; se sono tutti usati, il meno usato
export function nextColor(usedColors) {
    const counts = new Map(PALETTE.map((c) => [c, 0]));
    for (const color of usedColors) if (counts.has(color)) counts.set(color, counts.get(color) + 1);
    return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export function validateCategory(body, { partial = false } = {}) {
    const value = {};
    const errors = {};
    if (!partial || body?.name !== undefined) {
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name) errors.name = 'Il nome è obbligatorio';
        else if (name.length > 50) errors.name = 'Massimo 50 caratteri';
        value.name = name;
    }
    if (body?.color !== undefined) {
        if (typeof body.color === 'string' && COLOR_RE.test(body.color))
            value.color = body.color.toLowerCase();
        else errors.color = 'Colore non valido';
    }
    return Object.keys(errors).length ? { errors } : { value };
}

export function createCategories(db) {
    async function list() {
        const { rows } = await db.execute(`
            SELECT c.id, c.name, c.color, COUNT(e.id) AS events
            FROM categories c LEFT JOIN events e ON e.category = c.name
            GROUP BY c.id ORDER BY c.name COLLATE NOCASE`);
        return rows.map(toCategory);
    }

    async function findByName(name) {
        const { rows } = await db.execute({ sql: 'SELECT * FROM categories WHERE name = ?', args: [name] });
        return rows.length ? toCategory(rows[0]) : null;
    }

    async function findById(id) {
        const { rows } = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
        if (!rows.length) throw new HttpError(404, 'Categoria non trovata');
        return toCategory(rows[0]);
    }

    async function create({ name, color }) {
        if (await findByName(name)) throw new HttpError(409, `La categoria “${name}” esiste già`);
        if (!color) {
            const { rows } = await db.execute('SELECT color FROM categories');
            color = nextColor(rows.map((r) => r.color));
        }
        // INSERT OR IGNORE: se due richieste creano la stessa categoria insieme, ne resta una
        await db.execute({
            sql: 'INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)',
            args: [name, color],
        });
        return findByName(name);
    }

    // Restituisce la categoria con quel nome (senza distinguere maiuscole), creandola se non esiste
    async function resolve(name) {
        return (await findByName(name)) ?? create({ name });
    }

    // Imposta categoria (nome "ufficiale") e colore di un evento validato
    async function apply(event) {
        if (!event.category) return { ...event, category: null, color: NO_CATEGORY_COLOR };
        const category = await resolve(event.category);
        return { ...event, category: category.name, color: category.color };
    }

    async function update(id, changes) {
        const existing = await findById(id);
        const name = changes.name ?? existing.name;
        const color = changes.color ?? existing.color;
        if (name.toLowerCase() !== existing.name.toLowerCase() && (await findByName(name))) {
            throw new HttpError(409, `La categoria “${name}” esiste già`);
        }
        // Categoria e relativi eventi aggiornati insieme
        await db.batch(
            [
                { sql: 'UPDATE categories SET name = ?, color = ? WHERE id = ?', args: [name, color, id] },
                {
                    sql: 'UPDATE events SET category = ?, color = ? WHERE category = ?',
                    args: [name, color, existing.name],
                },
            ],
            'write'
        );
        return findById(id);
    }

    // Gli eventi della categoria eliminata restano, senza categoria
    async function remove(id) {
        const existing = await findById(id);
        await db.batch(
            [
                {
                    sql: 'UPDATE events SET category = NULL, color = ? WHERE category = ?',
                    args: [NO_CATEGORY_COLOR, existing.name],
                },
                { sql: 'DELETE FROM categories WHERE id = ?', args: [id] },
            ],
            'write'
        );
    }

    return { list, create, resolve, apply, update, remove, findById };
}
