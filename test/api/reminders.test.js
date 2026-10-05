import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupApp } from './helpers.js';

describe('API promemoria', () => {
    let ctx;
    before(async () => (ctx = await setupApp()));
    after(() => ctx.cleanup());

    test('creazione, completamento, modifica ed eliminazione', async () => {
        const created = await request(ctx.app).post('/api/reminders').send({ title: 'Latte' }).expect(201);
        assert.equal(created.body.priority, 'medium');
        assert.equal(created.body.is_completed, false);
        assert.ok(created.body.created_at);

        const id = created.body.id;
        const done = await request(ctx.app)
            .patch(`/api/reminders/${id}`)
            .send({ is_completed: true })
            .expect(200);
        assert.equal(done.body.is_completed, true);
        assert.equal(done.body.title, 'Latte');

        const edited = await request(ctx.app)
            .patch(`/api/reminders/${id}`)
            .send({ title: 'Latte e pane', due_date: '2026-10-06T18:00', priority: 'high' })
            .expect(200);
        assert.equal(edited.body.due_date, '2026-10-06T18:00');
        assert.equal(edited.body.is_completed, true);

        await request(ctx.app).patch(`/api/reminders/${id}`).send({ priority: 'urgente' }).expect(400);
        await request(ctx.app).patch(`/api/reminders/${id}`).send({}).expect(400);
        await request(ctx.app).delete(`/api/reminders/${id}`).expect(204);
        await request(ctx.app).patch(`/api/reminders/${id}`).send({ title: 'x' }).expect(404);
    });

    test('titolo obbligatorio', async () => {
        const res = await request(ctx.app).post('/api/reminders').send({ title: '   ' }).expect(400);
        assert.ok(res.body.details.title);
    });

    test('ordinamento: non completati, per scadenza, poi priorità', async () => {
        const add = (body) => request(ctx.app).post('/api/reminders').send(body).expect(201);
        await add({ title: 'Senza data alta', priority: 'high' });
        await add({ title: 'Domani', due_date: '2026-10-06' });
        await add({ title: 'Oggi', due_date: '2026-10-05' });
        const fatto = await add({ title: 'Fatto', due_date: '2026-10-01' });
        await request(ctx.app).patch(`/api/reminders/${fatto.body.id}`).send({ is_completed: true });

        const res = await request(ctx.app).get('/api/reminders').expect(200);
        assert.deepEqual(
            res.body.map((r) => r.title),
            ['Oggi', 'Domani', 'Senza data alta', 'Fatto']
        );

        const cleared = await request(ctx.app).delete('/api/reminders/completed').expect(200);
        assert.equal(cleared.body.deleted, 1);
    });
});
