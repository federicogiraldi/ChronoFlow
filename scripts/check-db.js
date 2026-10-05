// Verifica la connessione al database configurato in .env (DATABASE_URL + DATABASE_AUTH_TOKEN).
// Uso: npm run db:check
// Non stampa mai il token: mostra solo le informazioni utili a capire perché viene rifiutato.
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig } from '../backend/config.js';
import { createDb } from '../backend/db.js';
import { databaseErrorMessage } from '../backend/errors.js';

const config = loadConfig();
const url = config.databaseUrl;
const token = config.databaseAuthToken;

console.log(`URL database:   ${url}`);
if (url.startsWith('file:')) {
    console.log('\n⚠️  DATABASE_URL non è impostata nel file .env: sto usando il database locale.');
    process.exit(1);
}
if (!/^(libsql|https):\/\//.test(url)) {
    console.log(
        '\n❌ DATABASE_URL deve iniziare con libsql:// (copiala dalla pagina del database su Turso).'
    );
    process.exit(1);
}

if (!token) {
    console.log('\n❌ Il token non è stato trovato nel file .env.');
    console.log('   Deve esserci una riga che inizia esattamente con: DATABASE_AUTH_TOKEN=');
    console.log('   (tutto su una sola riga, senza spazi prima del nome).');
    // Mostriamo solo i NOMI delle variabili presenti in .env (mai i valori), per scovare errori di battitura
    if (existsSync('.env')) {
        const lines = readFileSync('.env', 'utf8')
            .split(/\r?\n/)
            .filter((line) => line.trim());
        console.log('\n   Righe trovate nel file .env (solo il nome):');
        for (const line of lines) {
            const name = line.includes('=') ? line.slice(0, line.indexOf('=')) : null;
            console.log(name ? `   - "${name}"` : '   - (riga senza "=": forse il token è andato a capo?)');
        }
    } else {
        console.log('   Il file .env non è stato trovato in questa cartella.');
    }
    process.exit(1);
}
console.log(`Token:          ${token.length} caratteri, inizia con "${token.slice(0, 4)}…"`);

// Il token è un JWT: la parte centrale contiene informazioni non segrete (permessi, scadenza)
try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const access = { rw: 'lettura e scrittura ✅', ro: 'solo lettura ❌ (serve lettura e scrittura)' };
    console.log(`Permessi:       ${access[payload.a] ?? payload.a ?? 'non indicati'}`);
    if (payload.exp) {
        const exp = new Date(payload.exp * 1000);
        console.log(
            `Scadenza:       ${exp.toLocaleString('it-IT')}${exp < new Date() ? '  ❌ SCADUTO' : ''}`
        );
    } else {
        console.log('Scadenza:       nessuna ✅');
    }
    if (payload.id) console.log(`Database (id):  ${payload.id}`);
    if (payload.gid) console.log(`Gruppo (id):    ${payload.gid}`);
} catch {
    console.log('⚠️  Il token non ha il formato previsto (JWT con tre parti separate da punti).');
    console.log('   Forse è stato copiato in modo incompleto, oppure è un token API della piattaforma');
    console.log('   (Settings → API Tokens) invece di un token del database.');
}

try {
    const db = createDb({ url, authToken: token });
    await db.execute('SELECT 1');
    console.log('\n✅ Connessione riuscita: URL e token sono corretti.');
    console.log('   Copia questi stessi valori su Vercel e fai Redeploy.');
    db.close();
} catch (error) {
    console.log(`\n❌ ${databaseErrorMessage(error) ?? error.message}`);
    process.exit(1);
}
