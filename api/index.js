// Punto di ingresso per Vercel: tutte le richieste /api/* arrivano qui (vedi vercel.json).
// I file statici del frontend sono serviti direttamente dalla CDN di Vercel.
import { loadConfig } from '../backend/config.js';
import { createDb, migrate } from '../backend/db.js';
import { createApp } from '../backend/app.js';

const config = loadConfig();
// Vercel usa UTC: impostiamo il fuso orario per calcolare correttamente l'orario delle notifiche
if (config.timezone) process.env.TZ = config.timezone;
const db = createDb({ url: config.databaseUrl, authToken: config.databaseAuthToken });

// Le migrazioni vengono eseguite una volta per ogni avvio a freddo della funzione
const ready = migrate(db);
// Evita il crash per "unhandled rejection": l'errore verrà restituito alla prima richiesta
ready.catch((error) => console.error('Migrazione del database fallita:', error));

export default createApp({ db, config, ready, serveStatic: false });
