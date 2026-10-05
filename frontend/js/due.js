// Calcolo degli avvisi da inviare: codice condiviso tra il browser (notifiche con app aperta)
// e il server (notifiche push con app chiusa). Nessuna dipendenza dal DOM.
import { addDays, parseLocal, startOfDay } from './dates.js';
import { expandOccurrences } from './recurrence.js';

// Se il dispositivo era in standby o il controllo è in ritardo, notifichiamo ancora gli avvisi scaduti da poco
export const GRACE_MS = 15 * 60 * 1000;
// I promemoria con sola data vengono notificati alle 9:00
export const REMINDER_DEFAULT_HOUR = 9;

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
