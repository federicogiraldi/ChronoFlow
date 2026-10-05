process.env.TZ = 'Europe/Rome';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocal } from '../../frontend/js/dates.js';
import { dueNotifications } from '../../frontend/js/notifications.js';

const event = {
    id: 1,
    title: 'Riunione',
    start_datetime: '2026-10-05T10:00',
    end_datetime: '2026-10-05T11:00',
    all_day: false,
    recurrence: 'none',
    notify_minutes: 15,
};

test('avviso dell’evento al momento del preavviso', () => {
    const data = { events: [event], reminders: [] };
    assert.equal(dueNotifications(data, parseLocal('2026-10-05T09:40')).length, 0);
    const [n] = dueNotifications(data, parseLocal('2026-10-05T09:46'));
    assert.equal(n.title, 'Riunione');
    // già inviato: non si ripete
    assert.equal(dueNotifications(data, parseLocal('2026-10-05T09:47'), { [n.key]: 1 }).length, 0);
    // troppo tardi (oltre il margine di tolleranza)
    assert.equal(dueNotifications(data, parseLocal('2026-10-05T11:00')).length, 0);
});

test('avvisi per eventi ricorrenti e promemoria', () => {
    const data = {
        events: [{ ...event, recurrence: 'weekly', notify_minutes: 0 }],
        reminders: [
            { id: 1, title: 'Con data', due_date: '2026-10-12', is_completed: false },
            { id: 2, title: 'Completato', due_date: '2026-10-12T09:00', is_completed: true },
        ],
    };
    const titles = dueNotifications(data, parseLocal('2026-10-12T10:00')).map((n) => n.title);
    assert.deepEqual(titles.sort(), ['Riunione']);
    assert.deepEqual(
        dueNotifications(data, parseLocal('2026-10-12T09:05')).map((n) => n.title),
        ['Con data']
    );
});
