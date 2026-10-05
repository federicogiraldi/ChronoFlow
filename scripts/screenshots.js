// Genera gli screenshot del README (docs/screenshots) con dati di esempio.
// Uso: node scripts/screenshots.js   (serve Chromium: npx playwright install chromium)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/screenshots');
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ['scripts/e2e-server.js', String(PORT)], {
    cwd: root,
    stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
    try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
        await new Promise((r) => setTimeout(r, 200));
    }
}

const post = (url, body) =>
    fetch(`${BASE}/api/${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then((r) => r.json());

const events = [
    [
        'Riunione di progetto',
        '2026-10-05T10:00',
        '2026-10-05T11:30',
        {
            category: 'Lavoro',
            color: '#8e5bd6',
            notify_minutes: 15,
            description: 'Revisione della roadmap\nPreparare le slide',
        },
    ],
    [
        'Palestra',
        '2026-10-06T18:00',
        '2026-10-06T19:00',
        { category: 'Sport', color: '#2e9e6b', recurrence: 'weekly' },
    ],
    ['Dentista', '2026-10-08T09:00', '2026-10-08T10:00', { category: 'Salute', color: '#d9534f' }],
    ['Call con il cliente', '2026-10-08T15:00', '2026-10-08T16:00', { category: 'Lavoro', color: '#8e5bd6' }],
    ['Aperitivo con Marco', '2026-10-09T19:00', '2026-10-09T21:00', { color: '#e8a33d' }],
    ['Weekend a Roma', '2026-10-16', '2026-10-18', { all_day: true, color: '#2aa5b8', category: 'Viaggi' }],
    [
        'Compleanno di Anna',
        '2026-10-21',
        '2026-10-21',
        { all_day: true, recurrence: 'yearly', color: '#d6569b' },
    ],
    ['Consegna progetto', '2026-10-23T12:00', '2026-10-23T13:00', { category: 'Lavoro', color: '#8e5bd6' }],
    [
        'Corso di inglese',
        '2026-10-01T20:00',
        '2026-10-01T21:30',
        { recurrence: 'weekly', color: '#3788d8', category: 'Studio' },
    ],
];
for (const [title, start, end, extra] of events) {
    await post('events', { title, start_datetime: start, end_datetime: end, ...extra });
}
await post('reminders', { title: 'Pagare la bolletta della luce', due_date: '2026-10-03', priority: 'high' });
await post('reminders', { title: 'Comprare il latte', due_date: '2026-10-05T18:00' });
await post('reminders', { title: 'Prenotare il treno per Roma', due_date: '2026-10-10', priority: 'high' });
await post('reminders', { title: 'Chiamare la nonna', priority: 'low' });
const done = await post('reminders', { title: 'Rinnovare l’abbonamento' });
await fetch(`${BASE}/api/reminders/${done.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_completed: true }),
});

const browser = await chromium.launch();
async function shot(name, { mobile = false, scheme = 'dark', action } = {}) {
    const context = await browser.newContext({
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
        colorScheme: scheme,
        ...(mobile
            ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
            : { viewport: { width: 1440, height: 900 } }),
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-05T10:00:00'));
    await page.goto(BASE);
    await page.waitForSelector('.day-cell');
    if (action) await action(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    await context.close();
    console.log(`✔ ${name}.png`);
}

await shot('desktop-dark-v2');
await shot('mobile-month-v2', { mobile: true });
await shot('mobile-week-v2', { mobile: true, scheme: 'light', action: (p) => p.click('[data-view=week]') });
await shot('mobile-reminders-v2', { mobile: true, action: (p) => p.click('#reminders-toggle') });

await browser.close();
server.kill();
