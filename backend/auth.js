// Protezione con password unica (app personale a utente singolo).
// Dopo il login il server imposta un cookie firmato con HMAC: non serve salvare
// sessioni nel database, quindi funziona anche su hosting serverless.
import crypto from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from './errors.js';

const COOKIE_NAME = 'cf_session';

function sign(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function parseCookies(header = '') {
    const cookies = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const key = part.slice(0, index).trim();
        try {
            cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            // cookie malformato: lo ignoriamo
        }
    }
    return cookies;
}

export function createAuth(config) {
    const enabled = Boolean(config.appPassword);
    // Se SESSION_SECRET non è impostato lo deriviamo dalla password:
    // cambiando la password si invalidano automaticamente tutte le sessioni.
    const secret =
        config.sessionSecret ||
        crypto.createHash('sha256').update(`chronoflow:${config.appPassword}`).digest('hex');
    const maxAgeMs = config.sessionDays * 24 * 60 * 60 * 1000;

    function createToken() {
        const expires = String(Date.now() + maxAgeMs);
        return `${expires}.${sign(expires, secret)}`;
    }

    function isValidToken(token) {
        if (typeof token !== 'string') return false;
        const [expires, signature] = token.split('.');
        if (!expires || !signature) return false;
        if (!safeEqual(signature, sign(expires, secret))) return false;
        return Number(expires) > Date.now();
    }

    function isAuthenticated(req) {
        if (!enabled) return true;
        return isValidToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
    }

    function cookieOptions() {
        return {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.secureCookies,
            path: '/',
        };
    }

    // Middleware: blocca le rotte protette se l'utente non ha fatto login
    function requireAuth(req, res, next) {
        if (isAuthenticated(req)) return next();
        next(new HttpError(401, 'Accesso richiesto'));
    }

    const router = express.Router();

    // Massimo 10 tentativi di login ogni 15 minuti per IP (contro il brute force)
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Troppi tentativi di accesso. Riprova tra qualche minuto.' },
    });

    router.get('/status', (req, res) => {
        res.json({ authRequired: enabled, authenticated: isAuthenticated(req) });
    });

    router.post('/login', loginLimiter, (req, res) => {
        if (!enabled) return res.json({ authenticated: true });
        const password = req.body?.password;
        if (typeof password !== 'string' || !safeEqual(password, config.appPassword)) {
            throw new HttpError(401, 'Password errata');
        }
        res.cookie(COOKIE_NAME, createToken(), { ...cookieOptions(), maxAge: maxAgeMs });
        res.json({ authenticated: true });
    });

    router.post('/logout', (req, res) => {
        res.clearCookie(COOKIE_NAME, cookieOptions());
        res.json({ authenticated: false });
    });

    return { router, requireAuth, enabled };
}
