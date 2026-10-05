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
