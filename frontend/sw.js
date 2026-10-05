// Service worker: rende l'app installabile e consultabile anche offline.
// - File dell'app: prima la rete (così gli aggiornamenti arrivano subito), poi la cache se offline.
// - Elenco eventi e promemoria: prima la rete, poi l'ultima copia salvata se offline.
// - Tutte le altre chiamate API (modifiche, login) passano sempre dalla rete.
const CACHE = 'chronoflow-v2';
const APP_SHELL = [
    './',
    'index.html',
    'style.css',
    'manifest.webmanifest',
    'js/main.js',
    'js/api.js',
    'js/calendar.js',
    'js/dates.js',
    'js/ics.js',
    'js/notifications.js',
    'js/recurrence.js',
    'js/reminders.js',
    'js/theme.js',
    'js/theme-init.js',
    'js/ui.js',
    'icons/icon.svg',
    'icons/icon-192.png',
];
const CACHED_API = ['/api/events', '/api/reminders'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const shell = await cache.match('index.html');
            if (shell) return shell;
        }
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) {
        if (CACHED_API.includes(url.pathname) && !url.search) event.respondWith(networkFirst(request));
        return;
    }
    event.respondWith(networkFirst(request));
});

// Clic su una notifica: porta in primo piano l'app (o la apre)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            const client = clients.find((c) => 'focus' in c);
            return client ? client.focus() : self.clients.openWindow('./');
        })
    );
});
