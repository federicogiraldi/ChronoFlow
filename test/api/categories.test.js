import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupApp } from './helpers.js';
import { createDb, migrate } from '../../backend/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const event = (extra) => ({
    title: 'Evento',
    start_datetime: '2026-10-05T10:00',
    end_datetime: '2026-10-05T11:00',
    ...extra,
});

describe('Categorie con colore fisso', () => {
    let ctx;
    before(async () => (ctx = await setupApp()));
    after(() => ctx.cleanup());

    test('il colore dell’evento è sempre quello della categoria', async () => {
        const first = await request(ctx.app)
            .post('/api/events')
            .send(event({ category: 'Lavoro', color: '#d9534f' }));
        const second = await request(ctx.app)
            .post('/api/events')
            .send(event({ category: 'lavoro', color: '#2aa5b8' }));
        // Categoria creata automaticamente; maiuscole/minuscole non creano doppioni
        assert.equal(second.body.category, 'Lavoro');
        assert.equal(first.body.color, second.body.color);

        const personale = await request(ctx.app)
            .post('/api/events')
            .send(event({ category: 'Personale' }));
        assert.notEqual(personale.body.color, first.body.color, 'categorie nuove hanno colori diversi');

        const none = await request(ctx.app)
            .post('/api/events')
            .send(event({ color: '#d9534f' }));
        assert.equal(none.body.category, null);
        assert.equal(none.body.color, '#3788d8');

        const list = await request(ctx.app).get('/api/categories').expect(200);
        assert.deepEqual(
            list.body.map((c) => [c.name, c.events]),
            [
                ['Lavoro', 2],
                ['Personale', 1],
            ]
        );
    });

    test('cambiare colore o nome aggiorna tutti gli eventi della categoria', async () => {
        const [lavoro] = (await request(ctx.app).get('/api/categories')).body;
        await request(ctx.app)
            .patch(`/api/categories/${lavoro.id}`)
            .send({ color: '#e8a33d', name: 'Ufficio' })
            .expect(200);
        const events = (await request(ctx.app).get('/api/events')).body.filter(
            (e) => e.category === 'Ufficio'
        );
        assert.equal(events.length, 2);
        assert.ok(events.every((e) => e.color === '#e8a33d'));

        await request(ctx.app).patch(`/api/categories/${lavoro.id}`).send({ name: 'personale' }).expect(409);
        await request(ctx.app).patch(`/api/categories/${lavoro.id}`).send({ color: 'rosso' }).expect(400);
    });

    test('eliminare una categoria lascia gli eventi senza categoria', async () => {
        const ufficio = (await request(ctx.app).get('/api/categories')).body.find(
            (c) => c.name === 'Ufficio'
        );
        await request(ctx.app).delete(`/api/categories/${ufficio.id}`).expect(204);
        const events = (await request(ctx.app).get('/api/events')).body;
        assert.equal(events.filter((e) => e.category === null).length, 3);
        assert.ok(events.filter((e) => e.category === null).every((e) => e.color === '#3788d8'));
    });

    test('creazione manuale con colore scelto e nome duplicato', async () => {
        const res = await request(ctx.app)
            .post('/api/categories')
            .send({ name: 'Sport', color: '#2E9E6B' })
            .expect(201);
        assert.equal(res.body.color, '#2e9e6b');
        await request(ctx.app).post('/api/categories').send({ name: 'sport' }).expect(409);
        await request(ctx.app).post('/api/categories').send({ name: '' }).expect(400);
    });
});

test('la migrazione crea le categorie dagli eventi esistenti con il colore più usato', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chronoflow-mig-'));
    const db = createDb({ url: pathToFileURL(path.join(dir, 'old.db')).href });
    // Database "vecchio": solo le prime tre migrazioni
    await db.execute(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)'
    );
    await db.execute(`CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
        start_datetime TEXT NOT NULL, end_datetime TEXT NOT NULL, color TEXT DEFAULT '#3788d8', category TEXT,
        all_day INTEGER NOT NULL DEFAULT 0, recurrence TEXT NOT NULL DEFAULT 'none', recurrence_until TEXT, notify_minutes INTEGER)`);
    await db.execute(
        'CREATE TABLE reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, due_date TEXT, priority TEXT, is_completed INTEGER, created_at TEXT)'
    );
    await db.execute(`CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, created_at TEXT NOT NULL)`);
    await db.execute('CREATE TABLE notifications_sent (key TEXT PRIMARY KEY, sent_at INTEGER NOT NULL)');
    for (const v of [1, 2, 3])
        await db.execute({ sql: 'INSERT INTO schema_migrations VALUES (?, ?)', args: [v, 'x'] });
    const insert = (category, color) =>
        db.execute({
            sql: "INSERT INTO events (title, start_datetime, end_datetime, category, color) VALUES ('e', '2026-01-01T10:00', '2026-01-01T11:00', ?, ?)",
            args: [category, color],
        });
    await insert('Lavoro', '#8e5bd6');
    await insert('Lavoro', '#8e5bd6');
    await insert('lavoro ', '#d9534f');
    await insert(null, '#d6569b');

    await migrate(db);
    const cats = (await db.execute('SELECT name, color FROM categories')).rows;
    assert.deepEqual(
        cats.map((c) => [c.name, c.color]),
        [['Lavoro', '#8e5bd6']]
    );
    const events = (await db.execute('SELECT category, color FROM events ORDER BY id')).rows;
    assert.deepEqual(
        events.map((e) => [e.category, e.color]),
        [
            ['Lavoro', '#8e5bd6'],
            ['Lavoro', '#8e5bd6'],
            ['Lavoro', '#8e5bd6'],
            [null, '#3788d8'],
        ]
    );
    db.close();
    rmSync(dir, { recursive: true, force: true });
});
