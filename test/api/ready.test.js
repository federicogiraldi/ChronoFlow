import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../backend/app.js';
import { loadConfig } from '../../backend/config.js';

test('se la preparazione del database fallisce, la richiesta successiva riprova', async () => {
    let attempts = 0;
    const db = { execute: async () => ({ rows: [] }) };
    const ready = async () => {
        attempts++;
        if (attempts === 1) {
            throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
        }
    };
    const app = createApp({ db, config: loadConfig({}), ready, serveStatic: false });
    const first = await request(app).get('/api/health').expect(503);
    assert.match(first.body.error, /non raggiungibile/);
    await request(app).get('/api/health').expect(200);
    assert.equal(attempts, 2);
});

test('health mostra una diagnosi non segreta se il database rifiuta il token', async () => {
    const token = `x.${Buffer.from(JSON.stringify({ a: 'rw', id: 'db-123' })).toString('base64url')}.firma`;
    const db = {
        execute: async () => {
            throw Object.assign(new Error('401'), { code: 'SERVER_ERROR', cause: { status: 401 } });
        },
    };
    const config = loadConfig({ DATABASE_URL: 'libsql://mio-db.turso.io', DATABASE_AUTH_TOKEN: token });
    const app = createApp({ db, config, serveStatic: false });
    const res = await request(app).get('/api/health').expect(503);
    assert.deepEqual(res.body.config, {
        databaseHost: 'mio-db.turso.io',
        tokenPresent: true,
        tokenLength: token.length,
        tokenDatabaseId: 'db-123',
        tokenAccess: 'rw',
        tokenExpired: false,
    });
    assert.ok(!JSON.stringify(res.body).includes('firma'));
});
