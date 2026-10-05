// Avvia il server per i test end-to-end con un database temporaneo e vuoto.
// Uso: node scripts/e2e-server.js <porta> [password]
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [port = '4173', password = ''] = process.argv.slice(2);
const dir = mkdtempSync(path.join(tmpdir(), 'chronoflow-e2e-'));
process.env.PORT = port;
process.env.HOST = '127.0.0.1';
process.env.APP_PASSWORD = password;
process.env.DATABASE_URL = pathToFileURL(path.join(dir, 'e2e.db')).href;

await import('../backend/server.js');
