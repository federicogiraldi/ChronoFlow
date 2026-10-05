process.env.TZ = 'Europe/Rome';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, parseICS } from '../../frontend/js/ics.js';

const events = [
    {
        id: 1,
        title: 'Riunione; con, caratteri\\speciali',
        description: 'Riga 1\nRiga 2',
        start_datetime: '2026-10-05T10:00',
        end_datetime: '2026-10-05T11:30',
        all_day: false,
        color: '#3788d8',
        category: 'Lavoro',
        recurrence: 'weekly',
        recurrence_until: '2026-12-31',
        notify_minutes: 15,
    },
    {
        id: 2,
        title: 'Vacanza',
        description: null,
        start_datetime: '2026-10-14T00:00',
        end_datetime: '2026-10-17T23:59',
        all_day: true,
        color: '#e8a33d',
        category: null,
        recurrence: 'none',
        recurrence_until: null,
        notify_minutes: null,
    },
];

test('export e re-import producono gli stessi eventi', () => {
    const ics = buildICS(events, new Date('2026-10-05T08:00:00Z'));
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20261018/); // DTEND esclusivo
    assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20261231T235959/);

    const { events: parsed, warnings } = parseICS(ics);
    assert.equal(warnings.length, 0);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], {
        title: events[0].title,
        description: 'Riga 1\nRiga 2',
        start_datetime: '2026-10-05T10:00',
        end_datetime: '2026-10-05T11:30',
        all_day: false,
        category: 'Lavoro',
        recurrence: 'weekly',
        recurrence_until: '2026-12-31',
        notify_minutes: 15,
    });
    assert.equal(parsed[1].all_day, true);
    assert.equal(parsed[1].start_datetime, '2026-10-14T00:00');
    assert.equal(parsed[1].end_datetime, '2026-10-17T23:59');
});

test('le righe lunghe vengono piegate a 75 byte', () => {
    const ics = buildICS([{ ...events[1], title: 'à'.repeat(100) }]);
    for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
    assert.equal(parseICS(ics).events[0].title, 'à'.repeat(100));
});

test('import di un file esterno: UTC, DURATION, COUNT, regole non supportate', () => {
    const text = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20260705T080000Z',
        'DURATION:PT1H30M',
        'SUMMARY:Estate UTC',
        'RRULE:FREQ=DAILY;COUNT=3',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Europe/Rome:20261005T090000',
        'DTEND;TZID=Europe/Rome:20261005T100000',
        'SUMMARY:Ogni due settimane',
        'RRULE:FREQ=WEEKLY;INTERVAL=2',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART:20261006T090000',
        'SUMMARY:Annullato',
        'STATUS:CANCELLED',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\n');
    const { events: parsed, warnings } = parseICS(text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].start_datetime, '2026-07-05T10:00'); // UTC+2 in estate
    assert.equal(parsed[0].end_datetime, '2026-07-05T11:30');
    assert.equal(parsed[0].recurrence_until, '2026-07-07');
    assert.equal(parsed[1].recurrence, 'none');
    assert.equal(warnings.length, 1);
});
