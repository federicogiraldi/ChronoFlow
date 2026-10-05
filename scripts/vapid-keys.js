// Genera le chiavi VAPID per le notifiche push. Uso: npm run vapid
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log('Copia queste righe nel file .env (o nelle Environment Variables di Vercel):\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:la-tua-email@example.com');
console.log('\n⚠️  La chiave privata è segreta: non pubblicarla e non caricarla su GitHub.');
