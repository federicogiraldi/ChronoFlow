// Configurazione centralizzata letta dalle variabili d'ambiente.
// Vedi .env.example per l'elenco completo.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database di default: file SQLite locale nella cartella backend (stesso percorso della v1.0,
// quindi i dati già esistenti vengono riutilizzati).
const DEFAULT_DB_URL = pathToFileURL(path.join(__dirname, 'chronoflow.db')).href;

// Toglie spazi e virgolette incollati per sbaglio (es. nelle Environment Variables di Vercel)
function clean(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const quoted = /^(['"])(.*)\1$/s.exec(trimmed);
    return quoted ? quoted[2].trim() : trimmed;
}

export function loadConfig(rawEnv = process.env) {
    const env = Object.fromEntries(Object.entries(rawEnv).map(([key, value]) => [key, clean(value)]));
    const isProduction = env.NODE_ENV === 'production';
    return {
        isProduction,
        port: Number(env.PORT) || 3000,
        // Vuoto = tutte le interfacce, IPv4 e IPv6 (su Windows "localhost" può risolversi in ::1)
        host: env.HOST || undefined,
        // Accettiamo anche i nomi usati negli esempi di Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
        databaseUrl: env.DATABASE_URL || env.TURSO_DATABASE_URL || DEFAULT_DB_URL,
        databaseAuthToken: env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined,
        // Se APP_PASSWORD è vuota l'app non richiede login (uso solo locale).
        appPassword: env.APP_PASSWORD || '',
        sessionSecret: env.SESSION_SECRET || '',
        // Durata della sessione dopo il login (giorni)
        sessionDays: Number(env.SESSION_DAYS) || 30,
        // Cookie "Secure" solo in produzione (in locale via http non funzionerebbe)
        secureCookies: isProduction,
        // Dietro un proxy (Vercel, Render...) serve per leggere l'IP reale del client
        trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : env.VERCEL ? 1 : false,
        // Fuso orario usato dal server per calcolare quando inviare le notifiche.
        // In locale vale quello del PC; su Vercel (che usa UTC) di default è l'Italia.
        timezone: env.APP_TIMEZONE || (env.VERCEL ? 'Europe/Rome' : undefined),
        // Notifiche push (app chiusa): chiavi VAPID generate con `npm run vapid`
        vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
        vapidPrivateKey: env.VAPID_PRIVATE_KEY || '',
        vapidSubject: env.VAPID_SUBJECT || 'mailto:chronoflow@example.com',
        // Chiave segreta per il servizio esterno che ogni minuto chiama /api/cron/notify
        cronSecret: env.CRON_SECRET || '',
    };
}
