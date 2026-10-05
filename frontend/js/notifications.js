// Notifiche per eventi (con preavviso) e scadenze dei promemoria. Due modalità:
// - "push": se il server ha le chiavi VAPID, il dispositivo si iscrive e il server invia gli avvisi
//   anche ad app chiusa o PC spento;
// - "local": altrimenti è la pagina a controllare ogni 30 secondi (solo con app aperta).
import { api } from './api.js';
import { dueNotifications } from './due.js';

const ENABLED_KEY = 'cf-notifications';
const SENT_KEY = 'cf-notified';
const CHECK_INTERVAL_MS = 30 * 1000;

let timer = null;
let getData = () => ({ events: [], reminders: [] });

export const isSupported = () => 'Notification' in window;

function readStorage(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignorato
    }
}

// Valore salvato: 'push', 'local' oppure false (le versioni precedenti salvavano true = 'local')
function getMode() {
    const mode = readStorage(ENABLED_KEY, false);
    return mode === true ? 'local' : mode;
}

export function isEnabled() {
    return isSupported() && Notification.permission === 'granted' && Boolean(getMode());
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window;

// iPhone/iPad: le notifiche push funzionano solo con l'app aggiunta alla schermata Home
export function needsIosInstall() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return ios && !standalone;
}

function base64ToUint8Array(base64) {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Iscrive questo dispositivo alle notifiche push del server. Restituisce false se non disponibili.
async function subscribePush() {
    if (!pushSupported()) return false;
    const config = await api.pushConfig().catch(() => null);
    if (!config?.enabled) return false;
    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = base64ToUint8Array(config.publicKey);
    let subscription = await registration.pushManager.getSubscription();
    // Se il server ha cambiato chiavi, la vecchia iscrizione non è più valida
    const currentKey = subscription?.options?.applicationServerKey;
    if (
        subscription &&
        currentKey &&
        new Uint8Array(currentKey).toString() !== applicationServerKey.toString()
    ) {
        await subscription.unsubscribe();
        subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
    });
    await api.pushSubscribe(subscription.toJSON());
    return true;
}

async function unsubscribePush() {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
}

// All'avvio: se le push erano attive, ci assicuriamo che il server conosca ancora questo dispositivo
export async function syncPush() {
    if (getMode() !== 'push' || !isEnabled()) return;
    try {
        if (!(await subscribePush())) writeStorage(ENABLED_KEY, 'local');
    } catch (error) {
        console.warn('Iscrizione push non aggiornata:', error);
    }
}

async function show({ key, title, body }) {
    const options = { body, tag: key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    // Su Android le notifiche funzionano solo tramite service worker
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
}

export async function check(now = new Date()) {
    // In modalità push è il server a inviare gli avvisi: evitiamo doppioni
    if (!isEnabled() || getMode() === 'push') return;
    const sent = readStorage(SENT_KEY, {});
    for (const notification of dueNotifications(getData(), now, sent)) {
        sent[notification.key] = now.getTime();
        try {
            await show(notification);
        } catch (error) {
            console.error('Notifica non mostrata:', error);
        }
    }
    // Teniamo traccia solo degli avvisi degli ultimi 2 giorni
    for (const [key, time] of Object.entries(sent)) {
        if (time < now.getTime() - 2 * 86400000) delete sent[key];
    }
    writeStorage(SENT_KEY, sent);
}

// dataProvider: funzione che restituisce { events, reminders } aggiornati
export function startNotifications(dataProvider) {
    getData = dataProvider;
    if (timer) return;
    check();
    timer = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
}

// Chiede il permesso e attiva/disattiva le notifiche.
// Restituisce la modalità attivata: 'push', 'local' oppure false.
export async function setEnabled(enabled) {
    if (!isSupported()) throw new Error('Questo browser non supporta le notifiche');
    if (!enabled) {
        await unsubscribePush().catch((error) => console.warn(error));
        writeStorage(ENABLED_KEY, false);
        return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        writeStorage(ENABLED_KEY, false);
        throw new Error('Permesso per le notifiche negato dal browser');
    }
    let mode = 'local';
    try {
        if (await subscribePush()) mode = 'push';
    } catch (error) {
        console.warn('Notifiche push non disponibili, uso quelle locali:', error);
    }
    writeStorage(ENABLED_KEY, mode);
    if (mode === 'push') api.pushTest().catch(() => {});
    return mode;
}
