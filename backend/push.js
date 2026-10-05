// Notifiche push: il server invia gli avvisi ai dispositivi iscritti anche quando l'app è chiusa.
// Usa lo standard Web Push (gratuito, integrato in Chrome, Edge, Firefox e Safari su iPhone).
// Il controllo degli avvisi da inviare parte:
//  - in locale: ogni minuto, dal server stesso (vedi server.js)
//  - su Vercel: quando un servizio esterno (es. cron-job.org) chiama /api/cron/notify
import crypto from 'node:crypto';
import express from 'express';
import webpush from 'web-push';
import { dueNotifications } from '../frontend/js/due.js';
import { HttpError } from './errors.js';

const SENT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function validSubscription(sub) {
    return (
        sub &&
        typeof sub.endpoint === 'string' &&
        /^https:\/\//.test(sub.endpoint) &&
        sub.endpoint.length < 2000 &&
        typeof sub.keys?.p256dh === 'string' &&
        typeof sub.keys?.auth === 'string'
    );
}

// sendNotification è sostituibile nei test
export function createPush({ db, config, sendNotification = webpush.sendNotification.bind(webpush) }) {
    const enabled = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
    const vapidDetails = enabled
        ? {
              subject: config.vapidSubject,
              publicKey: config.vapidPublicKey,
              privateKey: config.vapidPrivateKey,
          }
        : null;

    async function subscriptions() {
        const { rows } = await db.execute('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
        return rows;
    }

    // Invia un messaggio a tutti i dispositivi; elimina quelli non più validi (disinstallati, permesso revocato)
    async function sendToAll(payload) {
        const subs = await subscriptions();
        let delivered = 0;
        for (const sub of subs) {
            try {
                await sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    JSON.stringify(payload),
                    { vapidDetails, TTL: 60 * 60, urgency: 'high' }
                );
                delivered++;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE id = ?', args: [sub.id] });
                } else {
                    console.error('Invio push fallito:', error.statusCode ?? '', error.body ?? error.message);
                }
            }
        }
        return { devices: subs.length, delivered };
    }

    // Controlla eventi e promemoria e invia gli avvisi dovuti (ognuno una sola volta)
    async function runDueNotifications(now = new Date()) {
        if (!enabled) return { enabled: false, sent: 0 };
        const [events, reminders, sentRows] = await Promise.all([
            db.execute('SELECT * FROM events WHERE notify_minutes IS NOT NULL'),
            db.execute('SELECT * FROM reminders WHERE is_completed = 0 AND due_date IS NOT NULL'),
            db.execute({
                sql: 'SELECT key, sent_at FROM notifications_sent WHERE sent_at > ?',
                args: [now.getTime() - SENT_RETENTION_MS],
            }),
        ]);
        const sent = Object.fromEntries(sentRows.rows.map((r) => [r.key, Number(r.sent_at)]));
        const data = {
            events: events.rows.map((e) => ({
                ...e,
                id: Number(e.id),
                notify_minutes: Number(e.notify_minutes),
            })),
            reminders: reminders.rows.map((r) => ({ ...r, id: Number(r.id), is_completed: false })),
        };
        const due = dueNotifications(data, now, sent);

        for (const notification of due) {
            // Prima segniamo l'avviso come inviato: se due controlli partono insieme, solo uno lo invia
            const claim = await db.execute({
                sql: 'INSERT OR IGNORE INTO notifications_sent (key, sent_at) VALUES (?, ?)',
                args: [notification.key, now.getTime()],
            });
            if (!claim.rowsAffected) continue;
            await sendToAll({ title: notification.title, body: notification.body, tag: notification.key });
        }
        await db.execute({
            sql: 'DELETE FROM notifications_sent WHERE sent_at < ?',
            args: [now.getTime() - SENT_RETENTION_MS],
        });
        return { enabled: true, sent: due.length };
    }

    // Rotte per il browser (protette dal login, se attivo)
    const router = express.Router();

    router.get('/config', (req, res) => {
        res.json({ enabled, publicKey: enabled ? config.vapidPublicKey : null });
    });

    router.post('/subscribe', async (req, res) => {
        if (!enabled) throw new HttpError(503, 'Notifiche push non configurate sul server');
        const sub = req.body?.subscription;
        if (!validSubscription(sub)) throw new HttpError(400, 'Iscrizione non valida');
        await db.execute({
            sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
            args: [
                sub.endpoint,
                sub.keys.p256dh,
                sub.keys.auth,
                String(req.get('user-agent') || '').slice(0, 300),
                new Date().toISOString(),
            ],
        });
        res.status(201).json({ subscribed: true });
    });

    router.post('/unsubscribe', async (req, res) => {
        const endpoint = req.body?.endpoint;
        if (typeof endpoint !== 'string') throw new HttpError(400, 'Endpoint mancante');
        await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [endpoint] });
        res.json({ subscribed: false });
    });

    // Notifica di prova, per verificare che il telefono riceva gli avvisi
    router.post('/test', async (req, res) => {
        if (!enabled) throw new HttpError(503, 'Notifiche push non configurate sul server');
        const result = await sendToAll({
            title: 'ChronoFlow',
            body: '✅ Le notifiche funzionano! Riceverai qui i tuoi avvisi.',
            tag: 'test',
        });
        res.json(result);
    });

    // Rotta chiamata ogni minuto dal servizio esterno (protetta da CRON_SECRET, non dal login)
    const cronRouter = express.Router();
    cronRouter.all('/notify', async (req, res) => {
        if (!config.cronSecret) throw new HttpError(503, 'CRON_SECRET non configurato');
        const header = req.get('authorization')?.replace(/^Bearer\s+/i, '');
        const provided = header || req.query.key;
        if (typeof provided !== 'string' || !safeEqual(provided, config.cronSecret)) {
            throw new HttpError(401, 'Chiave non valida');
        }
        res.json(await runDueNotifications());
    });

    return { enabled, router, cronRouter, runDueNotifications, sendToAll };
}
