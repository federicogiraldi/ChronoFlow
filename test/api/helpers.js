import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../../backend/config.js';
import { createDb, migrate } from '../../backend/db.js';
import { createApp } from '../../backend/app.js';

// Crea un'app con un database SQLite temporaneo e vuoto
export async function setupApp(env = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'chronoflow-test-'));
    const db = createDb({ url: pathToFileURL(path.join(dir, 'test.db')).href });
    await migrate(db);
    const app = createApp({ db, config: loadConfig({ NODE_ENV: 'test', ...env }), serveStatic: false });
    const cleanup = () => {
        db.close();
        rmSync(dir, { recursive: true, force: true });
    };
    return { app, db, cleanup };
}
