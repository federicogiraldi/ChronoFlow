process.env.TZ = 'Europe/Rome';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupApp } from './helpers.js';

const VAPID = {
    VAPID_PUBLIC_KEY:
        'BBHZsplqbiX6v3IkUCE37L8sf5QPAZL9CIO7jCam2rjJ3YuQY_bbgjE8nkcKxkJSqS1DrVZLzi-CBcxkiYUe598',
    VAPID_PRIVATE_KEY: 'test-private-key',
    CRON_SECRET: 'segreto-cron',
};
const subscription = (n) => ({
    endpoint: `https://push.example.com/${n}`,
    keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});

describe('Notifiche push', () => {
    let ctx;
    let sent;
    let failing;
    before(async () => {
        ctx = await setupApp(VAPID, {
            sendNotification: async (sub, payload) => {
                if (failing.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
                sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
            },
        });
    });
    beforeEach(() => {
        sent = [];
        failing = new Set();
    });
    after(() => ctx.cleanup());

    test('configurazione e iscrizione dei dispositivi', async () => {
        const config = await request(ctx.app).get('/api/push/config').expect(200);
        assert.deepEqual(config.body, { enabled: true, publicKey: VAPID.VAPID_PUBLIC_KEY });

        await request(ctx.app)
            .post('/api/push/subscribe')
            .send({ subscription: subscription(1) })
            .expect(201);
        await request(ctx.app)
            .post('/api/push/subscribe')
            .send({ subscription: subscription(1) })
            .expect(201);
        await request(ctx.app)
            .post('/api/push/subscribe')
            .send({ subscription: { endpoint: 'http://x' } })
            .expect(400);

        const test1 = await request(ctx.app).post('/api/push/test').expect(200);
        assert.deepEqual(test1.body, { devices: 1, delivered: 1 });
        assert.match(sent[0].body, /funzionano/);
    });

    test('la rotta cron richiede la chiave segreta', async () => {
        await request(ctx.app).get('/api/cron/notify').expect(401);
        await request(ctx.app).get('/api/cron/notify?key=sbagliata').expect(401);
        await request(ctx.app).get('/api/cron/notify?key=segreto-cron').expect(200);
        await request(ctx.app)
            .post('/api/cron/notify')
            .set('Authorization', 'Bearer segreto-cron')
            .expect(200);
    });

    test('invia ogni avviso una sola volta e rimuove i dispositivi non più validi', async () => {
        await request(ctx.app)
            .post('/api/push/subscribe')
            .send({ subscription: subscription(2) })
            .expect(201);
        await request(ctx.app)
            .post('/api/events')
            .send({
                title: 'Dentista',
                start_datetime: '2026-10-08T09:00',
                end_datetime: '2026-10-08T10:00',
                notify_minutes: 60,
            })
            .expect(201);
        await request(ctx.app)
            .post('/api/reminders')
            .send({ title: 'Bolletta', due_date: '2026-10-08' })
            .expect(201);

        // 7:59: ancora niente
        assert.equal((await ctx.push.runDueNotifications(new Date('2026-10-08T07:59:00'))).sent, 0);

        // 8:01: preavviso di 1 ora del Dentista, su entrambi i dispositivi
        failing.add('https://push.example.com/1');
        const first = await ctx.push.runDueNotifications(new Date('2026-10-08T08:01:00'));
        assert.equal(first.sent, 1);
        assert.deepEqual(
            sent.map((s) => s.title),
            ['Dentista']
        );

        // Il dispositivo 1 ha risposto 410: è stato rimosso
        const devices = await ctx.db.execute('SELECT endpoint FROM push_subscriptions');
        assert.deepEqual(
            devices.rows.map((r) => r.endpoint),
            ['https://push.example.com/2']
        );

        // Il controllo successivo non lo reinvia
        assert.equal((await ctx.push.runDueNotifications(new Date('2026-10-08T08:02:00'))).sent, 0);

        // 9:00: scadenza del promemoria con sola data
        sent = [];
        await ctx.push.runDueNotifications(new Date('2026-10-08T09:00:30'));
        assert.deepEqual(
            sent.map((s) => s.title),
            ['Bolletta']
        );
    });

    test('disiscrizione', async () => {
        await request(ctx.app)
            .post('/api/push/unsubscribe')
            .send({ endpoint: 'https://push.example.com/2' })
            .expect(200);
        const devices = await ctx.db.execute('SELECT COUNT(*) AS n FROM push_subscriptions');
        assert.equal(Number(devices.rows[0].n), 0);
    });
});

describe('Notifiche push non configurate', () => {
    let ctx;
    before(async () => (ctx = await setupApp()));
    after(() => ctx.cleanup());

    test('il browser usa le notifiche locali', async () => {
        const config = await request(ctx.app).get('/api/push/config').expect(200);
        assert.deepEqual(config.body, { enabled: false, publicKey: null });
        await request(ctx.app)
            .post('/api/push/subscribe')
            .send({ subscription: subscription(1) })
            .expect(503);
        await request(ctx.app).get('/api/cron/notify?key=x').expect(503);
    });
});
