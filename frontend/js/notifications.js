// Notifiche del browser per eventi (con preavviso) e scadenze dei promemoria.
// Funzionano mentre l'app è aperta, anche in una scheda in background o come app installata (PWA).
import { addDays, parseLocal, startOfDay } from './dates.js';
import { expandOccurrences } from './recurrence.js';

const ENABLED_KEY = 'cf-notifications';
const SENT_KEY = 'cf-notified';
const CHECK_INTERVAL_MS = 30 * 1000;
// Se il dispositivo era in standby, notifichiamo ancora gli avvisi scaduti da poco
const GRACE_MS = 15 * 60 * 1000;
// I promemoria con sola data vengono notificati alle 9:00
const REMINDER_DEFAULT_HOUR = 9;

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

export function isEnabled() {
    return isSupported() && Notification.permission === 'granted' && readStorage(ENABLED_KEY, false) === true;
}

// Calcola gli avvisi da mostrare: [{ key, title, body, at (ms) }]
export function dueNotifications({ events, reminders }, now = new Date(), sent = {}) {
    const result = [];
    const from = startOfDay(addDays(now, -1));
    const to = addDays(startOfDay(now), 9); // preavviso massimo: 7 giorni

    const withNotice = events.filter((e) => e.notify_minutes !== null && e.notify_minutes !== undefined);
    for (const occ of expandOccurrences(withNotice, from, to)) {
        const at = occ.start.getTime() - occ.event.notify_minutes * 60000;
        const key = `e:${occ.key}:${occ.event.notify_minutes}`;
        if (at <= now.getTime() && at > now.getTime() - GRACE_MS && !sent[key]) {
            const when = occ.event.all_day
                ? 'Tutto il giorno'
                : occ.start.toLocaleString('it-IT', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                  });
            result.push({ key, title: occ.event.title, body: `📅 ${when}`, at });
        }
    }

    for (const reminder of reminders) {
        if (reminder.is_completed || !reminder.due_date) continue;
        const due = parseLocal(reminder.due_date);
        if (reminder.due_date.length === 10) due.setHours(REMINDER_DEFAULT_HOUR, 0, 0, 0);
        const at = due.getTime();
        const key = `r:${reminder.id}:${reminder.due_date}`;
        if (at <= now.getTime() && at > now.getTime() - GRACE_MS && !sent[key]) {
            result.push({ key, title: reminder.title, body: '🔔 Promemoria in scadenza', at });
        }
    }
    return result;
}

async function show({ key, title, body }) {
    const options = { body, tag: key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    // Su Android le notifiche funzionano solo tramite service worker
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
}

export async function check(now = new Date()) {
    if (!isEnabled()) return;
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

// Chiede il permesso e attiva/disattiva le notifiche. Restituisce lo stato finale.
export async function setEnabled(enabled) {
    if (!isSupported()) throw new Error('Questo browser non supporta le notifiche');
    if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            writeStorage(ENABLED_KEY, false);
            throw new Error('Permesso per le notifiche negato dal browser');
        }
        writeStorage(ENABLED_KEY, true);
        return true;
    }
    writeStorage(ENABLED_KEY, false);
    return false;
}
