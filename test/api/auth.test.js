import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupApp } from './helpers.js';

describe('Protezione con password', () => {
    let ctx;
    before(async () => (ctx = await setupApp({ APP_PASSWORD: 'segreta', SESSION_SECRET: 'x'.repeat(32) })));
    after(() => ctx.cleanup());

    test('senza login le API dei dati rispondono 401', async () => {
        await request(ctx.app).get('/api/events').expect(401);
        await request(ctx.app).post('/api/reminders').send({ title: 'x' }).expect(401);
        const status = await request(ctx.app).get('/api/auth/status').expect(200);
        assert.deepEqual(status.body, { authRequired: true, authenticated: false });
        await request(ctx.app).get('/api/health').expect(200);
    });

    test('password errata rifiutata', async () => {
        await request(ctx.app).post('/api/auth/login').send({ password: 'sbagliata' }).expect(401);
    });

    test('login, accesso con cookie e logout', async () => {
        const agent = request.agent(ctx.app);
        const res = await agent.post('/api/auth/login').send({ password: 'segreta' }).expect(200);
        const cookie = res.headers['set-cookie'][0];
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
        await agent.get('/api/events').expect(200);
        await agent.post('/api/auth/logout').expect(200);
        await agent.get('/api/events').expect(401);
    });

    test('cookie manomesso rifiutato', async () => {
        const forged = `cf_session=${Date.now() + 1e9}.firma-falsa`;
        await request(ctx.app).get('/api/events').set('Cookie', forged).expect(401);
    });
});

describe('Senza password (uso locale)', () => {
    let ctx;
    before(async () => (ctx = await setupApp()));
    after(() => ctx.cleanup());

    test('accesso libero', async () => {
        const status = await request(ctx.app).get('/api/auth/status').expect(200);
        assert.deepEqual(status.body, { authRequired: false, authenticated: true });
        await request(ctx.app).get('/api/events').expect(200);
    });
});
