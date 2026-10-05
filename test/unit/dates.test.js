process.env.TZ = 'Europe/Rome';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    addMonthsClamped,
    diffDays,
    monthGridDays,
    parseLocal,
    startOfWeek,
    toDateKey,
    toLocalDateTime,
} from '../../frontend/js/dates.js';

test('parseLocal e toLocalDateTime sono inversi', () => {
    assert.equal(toLocalDateTime(parseLocal('2026-03-29T02:30')), '2026-03-29T03:30'); // ora inesistente (DST)
    assert.equal(toLocalDateTime(parseLocal('2026-10-05T10:15')), '2026-10-05T10:15');
    assert.equal(toDateKey(parseLocal('2026-12-31')), '2026-12-31');
});

test('startOfWeek restituisce il lunedì', () => {
    assert.equal(toDateKey(startOfWeek(parseLocal('2026-10-11'))), '2026-10-05'); // domenica
    assert.equal(toDateKey(startOfWeek(parseLocal('2026-10-05'))), '2026-10-05'); // lunedì
});

test('monthGridDays copre settimane intere da lunedì a domenica', () => {
    const days = monthGridDays(parseLocal('2026-10-15'));
    assert.equal(days.length % 7, 0);
    assert.equal(toDateKey(days[0]), '2026-09-28');
    assert.equal(toDateKey(days.at(-1)), '2026-11-01');
});

test('addMonthsClamped non salta i mesi corti', () => {
    assert.equal(toDateKey(addMonthsClamped(parseLocal('2026-01-31'), 1)), '2026-02-28');
    assert.equal(toDateKey(addMonthsClamped(parseLocal('2024-01-31'), 1)), '2024-02-29');
});

test('diffDays ignora il cambio dell’ora legale', () => {
    assert.equal(diffDays(parseLocal('2026-03-28'), parseLocal('2026-03-30')), 2);
    assert.equal(diffDays(parseLocal('2026-10-24T23:00'), parseLocal('2026-10-26T01:00')), 2);
});
