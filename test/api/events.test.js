import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupApp } from './helpers.js';

const event = {
    title: 'Riunione',
    start_datetime: '2026-10-05T10:00',
    end_datetime: '2026-10-05T11:00',
    category: 'Lavoro',
};

describe('API eventi', () => {
    let ctx;
    before(async () => (ctx = await setupApp()));
    after(() => ctx.cleanup());

    test('health check', async () => {
        const res = await request(ctx.app).get('/api/health').expect(200);
        assert.equal(res.body.status, 'ok');
    });

    test('CRUD completo', async () => {
        const created = await request(ctx.app).post('/api/events').send(event).expect(201);
        const id = created.body.id;
        assert.equal(created.body.title, 'Riunione');
        assert.equal(created.body.all_day, false);

        const list = await request(ctx.app).get('/api/events').expect(200);
        assert.equal(list.body.length, 1);
        assert.equal(list.headers['cache-control'], 'no-store');

        const updated = await request(ctx.app)
            .put(`/api/events/${id}`)
            .send({ ...event, title: 'Riunione spostata', recurrence: 'weekly', notify_minutes: 30 })
            .expect(200);
        assert.equal(updated.body.recurrence, 'weekly');

        const one = await request(ctx.app).get(`/api/events/${id}`).expect(200);
        assert.equal(one.body.title, 'Riunione spostata');
        assert.equal(one.body.notify_minutes, 30);

        await request(ctx.app).delete(`/api/events/${id}`).expect(204);
        await request(ctx.app).get(`/api/events/${id}`).expect(404);
        await request(ctx.app).delete(`/api/events/${id}`).expect(404);
    });

    test('validazione: 400 con dettagli per campo', async () => {
        const res = await request(ctx.app)
            .post('/api/events')
            .send({ title: '', start_datetime: '2026-10-05T10:00', end_datetime: '2026-10-05T09:00' })
            .expect(400);
        assert.ok(res.body.details.title);
        assert.ok(res.body.details.end_datetime);
    });

    test('JSON malformato, id non valido, rotta inesistente', async () => {
        await request(ctx.app)
            .post('/api/events')
            .set('Content-Type', 'application/json')
            .send('{bad')
            .expect(400);
        await request(ctx.app).get('/api/events/abc').expect(400);
        await request(ctx.app).put('/api/events/999').send(event).expect(404);
        const res = await request(ctx.app).get('/api/nope').expect(404);
        assert.equal(res.body.error, 'Risorsa non trovata');
    });

    test('filtro per intervallo include le serie ricorrenti', async () => {
        await request(ctx.app)
            .post('/api/events')
            .send({
                ...event,
                title: 'Settembre',
                start_datetime: '2026-09-01T10:00',
                end_datetime: '2026-09-01T11:00',
            });
        await request(ctx.app)
            .post('/api/events')
            .send({
                ...event,
                title: 'Serie',
                start_datetime: '2026-01-01T10:00',
                end_datetime: '2026-01-01T11:00',
                recurrence: 'monthly',
            });
        await request(ctx.app)
            .post('/api/events')
            .send({
                ...event,
                title: 'Serie finita',
                start_datetime: '2026-01-01T10:00',
                end_datetime: '2026-01-01T11:00',
                recurrence: 'daily',
                recurrence_until: '2026-02-01',
            });
        const res = await request(ctx.app).get('/api/events?from=2026-10-01&to=2026-10-31').expect(200);
        assert.deepEqual(
            res.body.map((e) => e.title),
            ['Serie']
        );
        await request(ctx.app).get('/api/events?from=2026-10-31&to=2026-10-01').expect(400);
    });

    test('importazione in blocco con eventi non validi scartati', async () => {
        const res = await request(ctx.app)
            .post('/api/events/import')
            .send({ events: [event, { ...event, title: 'Due' }, { title: 'Senza date' }] })
            .expect(201);
        assert.equal(res.body.imported, 2);
        assert.equal(res.body.skipped, 1);
        await request(ctx.app).post('/api/events/import').send({ events: [] }).expect(400);
    });

    test('header di sicurezza presenti', async () => {
        const res = await request(ctx.app).get('/api/health');
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.ok(res.headers['content-security-policy']);
        assert.equal(res.headers['x-powered-by'], undefined);
    });
});
