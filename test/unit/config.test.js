import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../backend/config.js';
import { databaseErrorMessage } from '../../backend/errors.js';

test('le variabili incollate con spazi o virgolette vengono ripulite', () => {
    const config = loadConfig({
        DATABASE_URL: '  "libsql://db.turso.io"\n',
        DATABASE_AUTH_TOKEN: "'token'",
        APP_PASSWORD: ' segreta ',
    });
    assert.equal(config.databaseUrl, 'libsql://db.turso.io');
    assert.equal(config.databaseAuthToken, 'token');
    assert.equal(config.appPassword, 'segreta');
});

test('errori del database tradotti in messaggi comprensibili', () => {
    const unauthorized = Object.assign(new Error('x'), { code: 'SERVER_ERROR', cause: { status: 401 } });
    assert.match(databaseErrorMessage(unauthorized), /DATABASE_AUTH_TOKEN/);
    const timeout = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
    assert.match(databaseErrorMessage(timeout), /non raggiungibile/);
    assert.equal(databaseErrorMessage(new Error('altro')), null);
});
