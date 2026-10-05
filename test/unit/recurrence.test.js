process.env.TZ = 'Europe/Rome';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocal } from '../../frontend/js/dates.js';
import { expandOccurrences, groupByDay, occurrenceDays } from '../../frontend/js/recurrence.js';

const base = { id: 1, title: 'E', all_day: false, recurrence: 'none', recurrence_until: null };
const range = (from, to) => [parseLocal(from), parseLocal(to)];
const starts = (list) => list.map((o) => o.startValue);

test('evento singolo nell’intervallo', () => {
    const event = { ...base, start_datetime: '2026-10-05T10:00', end_datetime: '2026-10-05T11:00' };
    assert.deepEqual(starts(expandOccurrences([event], ...range('2026-10-01', '2026-11-01'))), [
        '2026-10-05T10:00',
    ]);
    assert.equal(expandOccurrences([event], ...range('2026-11-01', '2026-12-01')).length, 0);
});

test('evento multi-giorno che inizia prima dell’intervallo', () => {
    const event = { ...base, start_datetime: '2026-09-29T10:00', end_datetime: '2026-10-02T11:00' };
    assert.equal(expandOccurrences([event], ...range('2026-10-01', '2026-11-01')).length, 1);
});

test('ricorrenza settimanale con data di fine', () => {
    const event = {
        ...base,
        start_datetime: '2026-10-06T18:00',
        end_datetime: '2026-10-06T19:00',
        recurrence: 'weekly',
        recurrence_until: '2026-10-20',
    };
    assert.deepEqual(starts(expandOccurrences([event], ...range('2026-10-01', '2026-11-01'))), [
        '2026-10-06T18:00',
        '2026-10-13T18:00',
        '2026-10-20T18:00',
    ]);
});

test('ricorrenza giornaliera attraversa il cambio dell’ora legale mantenendo l’orario', () => {
    const event = {
        ...base,
        start_datetime: '2026-01-01T09:00',
        end_datetime: '2026-01-01T10:00',
        recurrence: 'daily',
    };
    const list = expandOccurrences([event], ...range('2026-10-24', '2026-10-27'));
    assert.deepEqual(starts(list), ['2026-10-24T09:00', '2026-10-25T09:00', '2026-10-26T09:00']);
    assert.ok(list.every((o) => o.endValue.endsWith('T10:00')));
});

test('ricorrenza mensile il 31 salta i mesi senza quel giorno', () => {
    const event = {
        ...base,
        start_datetime: '2026-01-31T09:00',
        end_datetime: '2026-01-31T10:00',
        recurrence: 'monthly',
    };
    assert.deepEqual(starts(expandOccurrences([event], ...range('2026-01-01', '2026-06-01'))), [
        '2026-01-31T09:00',
        '2026-03-31T09:00',
        '2026-05-31T09:00',
    ]);
});

test('ricorrenza annuale il 29 febbraio solo negli anni bisestili', () => {
    const event = {
        ...base,
        start_datetime: '2024-02-29T00:00',
        end_datetime: '2024-02-29T23:59',
        all_day: true,
        recurrence: 'yearly',
    };
    assert.deepEqual(starts(expandOccurrences([event], ...range('2025-01-01', '2029-01-01'))), [
        '2028-02-29T00:00',
    ]);
});

test('una serie lunga parte vicino all’intervallo richiesto', () => {
    const event = {
        ...base,
        start_datetime: '2000-01-01T08:00',
        end_datetime: '2000-01-01T08:30',
        recurrence: 'daily',
    };
    assert.equal(expandOccurrences([event], ...range('2026-10-01', '2026-10-08')).length, 7);
});

test('un evento che termina a mezzanotte non occupa il giorno dopo', () => {
    const [occ] = expandOccurrences(
        [{ ...base, start_datetime: '2026-10-05T22:00', end_datetime: '2026-10-06T00:00' }],
        ...range('2026-10-01', '2026-11-01')
    );
    assert.deepEqual(occurrenceDays(occ), ['2026-10-05']);
});

test('groupByDay distribuisce gli eventi multi-giorno', () => {
    const event = {
        ...base,
        start_datetime: '2026-10-14T00:00',
        end_datetime: '2026-10-16T23:59',
        all_day: true,
    };
    const map = groupByDay(expandOccurrences([event], ...range('2026-10-01', '2026-11-01')));
    assert.deepEqual([...map.keys()], ['2026-10-14', '2026-10-15', '2026-10-16']);
});
