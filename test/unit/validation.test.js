import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateTime, parseId, validateEvent, validateReminder } from '../../backend/validation.js';

const valid = { title: ' Test ', start_datetime: '2026-10-05T10:00', end_datetime: '2026-10-05T11:00' };

test('evento valido con valori di default', () => {
    const { value, errors } = validateEvent(valid);
    assert.equal(errors, undefined);
    assert.equal(value.title, 'Test');
    assert.equal(value.color, '#3788d8');
    assert.equal(value.recurrence, 'none');
    assert.equal(value.all_day, 0);
});

test('errori per campi mancanti o non validi', () => {
    const { errors } = validateEvent({
        title: '',
        start_datetime: '2026-02-30T10:00',
        end_datetime: 'x',
        color: 'red',
    });
    assert.deepEqual(Object.keys(errors).sort(), ['color', 'end_datetime', 'start_datetime', 'title']);
});

test('la fine non può precedere l’inizio', () => {
    const { errors } = validateEvent({ ...valid, end_datetime: '2026-10-05T09:00' });
    assert.ok(errors.end_datetime);
});

test('eventi di tutto il giorno coprono le giornate intere', () => {
    const { value } = validateEvent({
        ...valid,
        all_day: true,
        start_datetime: '2026-10-05',
        end_datetime: '2026-10-06',
    });
    assert.equal(value.start_datetime, '2026-10-05T00:00');
    assert.equal(value.end_datetime, '2026-10-06T23:59');
});

test('ricorrenza e notifica validate', () => {
    assert.ok(validateEvent({ ...valid, recurrence: 'hourly' }).errors.recurrence);
    assert.ok(
        validateEvent({ ...valid, recurrence: 'daily', recurrence_until: '2026-10-01' }).errors
            .recurrence_until
    );
    assert.ok(validateEvent({ ...valid, notify_minutes: -5 }).errors.notify_minutes);
    assert.equal(validateEvent({ ...valid, notify_minutes: '15' }).value.notify_minutes, 15);
});

test('promemoria: aggiornamento parziale', () => {
    assert.deepEqual(validateReminder({ is_completed: true }, { partial: true }).value, { is_completed: 1 });
    assert.ok(validateReminder({}, { partial: true }).errors);
    assert.ok(validateReminder({ priority: 'urgent' }, { partial: true }).errors.priority);
    assert.equal(validateReminder({ title: 'x', due_date: '2026-10-05' }).value.due_date, '2026-10-05');
});

test('normalizzazione date e id', () => {
    assert.equal(normalizeDateTime('2026-10-05T10:00:59.123'), '2026-10-05T10:00');
    assert.equal(normalizeDateTime('2026-10-05T24:00'), null);
    assert.equal(parseId('12'), 12);
    assert.equal(parseId('1e3'), null);
    assert.equal(parseId('-1'), null);
});
