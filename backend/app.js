// Costruzione dell'applicazione Express (senza avviare il server):
// usata da server.js in locale, da api/index.js su Vercel e dai test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createAuth } from './auth.js';
import { createPush } from './push.js';
import { errorHandler, HttpError } from './errors.js';
import { eventsRouter } from './routes/events.js';
import { remindersRouter } from './routes/reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '../frontend');

// ready: Promise opzionale (es. migrazioni del DB) da attendere prima di servire le API
// push: modulo notifiche già creato (opzionale, altrimenti viene creato qui)
export function createApp({ db, config, ready, serveStatic = true, push = createPush({ db, config }) }) {
    const app = express();
    app.set('trust proxy', config.trustProxy);
    app.disable('x-powered-by');

    // Header di sicurezza (CSP, nosniff, frame-ancestors...)
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    // In locale l'app è raggiungibile in http dalla rete di casa:
                    // forzare https romperebbe il caricamento dei file
                    upgradeInsecureRequests: config.isProduction ? [] : null,
                },
            },
            strictTransportSecurity: config.isProduction,
        })
    );

    const api = express.Router();
    api.use(express.json({ limit: '2mb' }));
    api.use(
        rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 1000,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            message: { error: 'Troppe richieste, riprova più tardi.' },
        })
    );
    // Le risposte delle API non vanno mai messe in cache dal browser
    api.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    if (ready) api.use(async (req, res, next) => (await ready, next()));

    api.get('/health', async (req, res) => {
        await db.execute('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const auth = createAuth(config);
    api.use('/auth', auth.router);
    api.use('/events', auth.requireAuth, eventsRouter(db));
    api.use('/reminders', auth.requireAuth, remindersRouter(db));
    api.use('/push', auth.requireAuth, push.router);
    api.use('/cron', push.cronRouter);
    api.use((req, res, next) => next(new HttpError(404, 'Risorsa non trovata')));

    app.use('/api', api);

    if (serveStatic) {
        app.use(
            express.static(FRONTEND_DIR, {
                // Nessun passaggio di build: i file vengono sempre riconvalidati (ETag)
                setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
            })
        );
    }

    app.use(errorHandler);
    return app;
}
