// Avvio del server Node (uso locale o hosting tradizionale).
import os from 'node:os';
import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = createDb({ url: config.databaseUrl, authToken: config.databaseAuthToken });

await migrate(db);

const app = createApp({ db, config });

// Indirizzi IP della rete locale, per aprire l'app dal telefono
function lanAddresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((net) => net && net.family === 'IPv4' && !net.internal)
        .map((net) => net.address);
}

const server = app.listen(config.port, config.host, () => {
    console.log('==================================================');
    console.log('🚀 ChronoFlow avviato');
    console.log(`💻 Locale:        http://localhost:${config.port}`);
    for (const ip of lanAddresses()) console.log(`📱 Rete locale:   http://${ip}:${config.port}`);
    console.log(`🔒 Password:      ${config.appPassword ? 'attiva' : 'disattivata (APP_PASSWORD vuota)'}`);
    console.log('==================================================');
});

// Chiusura pulita (Ctrl+C o arresto del container)
function shutdown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
