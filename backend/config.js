// Configurazione centralizzata letta dalle variabili d'ambiente.
// Vedi .env.example per l'elenco completo.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database di default: file SQLite locale nella cartella backend (stesso percorso della v1.0,
// quindi i dati già esistenti vengono riutilizzati).
const DEFAULT_DB_URL = pathToFileURL(path.join(__dirname, 'chronoflow.db')).href;

export function loadConfig(env = process.env) {
    const isProduction = env.NODE_ENV === 'production';
    return {
        isProduction,
        port: Number(env.PORT) || 3000,
        // Vuoto = tutte le interfacce, IPv4 e IPv6 (su Windows "localhost" può risolversi in ::1)
        host: env.HOST || undefined,
        databaseUrl: env.DATABASE_URL || DEFAULT_DB_URL,
        databaseAuthToken: env.DATABASE_AUTH_TOKEN || undefined,
        // Se APP_PASSWORD è vuota l'app non richiede login (uso solo locale).
        appPassword: env.APP_PASSWORD || '',
        sessionSecret: env.SESSION_SECRET || '',
        // Durata della sessione dopo il login (giorni)
        sessionDays: Number(env.SESSION_DAYS) || 30,
        // Cookie "Secure" solo in produzione (in locale via http non funzionerebbe)
        secureCookies: isProduction,
        // Dietro un proxy (Vercel, Render...) serve per leggere l'IP reale del client
        trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : env.VERCEL ? 1 : false,
    };
}
