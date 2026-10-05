// Espansione degli eventi (anche ricorrenti) nelle singole occorrenze di un intervallo.
import { addDays, diffDays, parseLocal, toDateKey, toLocalDateTime } from './dates.js';

export const RECURRENCE_LABELS = {
    none: 'Non si ripete',
    daily: 'Ogni giorno',
    weekly: 'Ogni settimana',
    monthly: 'Ogni mese',
    yearly: 'Ogni anno',
};

const MAX_OCCURRENCES = 1000;

// n-esima ripetizione a partire dalla data iniziale.
// Per mensile/annuale, se il giorno non esiste (es. 31 o 29 febbraio) l'occorrenza viene saltata.
function nthStart(start, recurrence, n) {
    switch (recurrence) {
        case 'daily':
            return addDays(start, n);
        case 'weekly':
            return addDays(start, 7 * n);
        case 'monthly':
        case 'yearly': {
            const months = recurrence === 'monthly' ? n : 12 * n;
            const date = new Date(
                start.getFullYear(),
                start.getMonth() + months,
                start.getDate(),
                start.getHours(),
                start.getMinutes()
            );
            return date.getDate() === start.getDate() ? date : null;
        }
        default:
            return n === 0 ? start : null;
    }
}

// Prima ripetizione da cui ha senso partire per arrivare a rangeStart (evita di scorrere anni di occorrenze)
function firstIndex(start, recurrence, rangeStart, spanDays) {
    const days = diffDays(start, rangeStart) - spanDays;
    if (days <= 0) return 0;
    switch (recurrence) {
        case 'daily':
            return days;
        case 'weekly':
            return Math.floor(days / 7);
        case 'monthly':
            return Math.max(0, Math.floor(days / 31) - 1);
        case 'yearly':
            return Math.max(0, Math.floor(days / 366) - 1);
        default:
            return 0;
    }
}

// Restituisce le occorrenze che si sovrappongono a [rangeStart, rangeEnd), ordinate per inizio.
// Ogni occorrenza: { event, start, end (Date), startValue, endValue (stringhe locali), key }
export function expandOccurrences(events, rangeStart, rangeEnd) {
    const occurrences = [];

    for (const event of events) {
        const start = parseLocal(event.start_datetime);
        const end = parseLocal(event.end_datetime);
        // Durata espressa come giorni di calendario + ora di fine: resta corretta anche col cambio dell'ora legale
        const spanDays = diffDays(start, end);
        const recurrence = event.recurrence || 'none';
        const until = event.recurrence_until || null;

        let count = 0;
        for (let n = firstIndex(start, recurrence, rangeStart, spanDays); count < MAX_OCCURRENCES; n++) {
            if (recurrence === 'none' && n > 0) break;
            const occStart = nthStart(start, recurrence, n);
            if (occStart === null) {
                if (recurrence === 'none') break;
                continue;
            }
            if (occStart >= rangeEnd) break;
            if (until && toDateKey(occStart) > until) break;
            count++;

            const occEnd = addDays(occStart, spanDays);
            occEnd.setHours(end.getHours(), end.getMinutes(), 0, 0);
            if (occEnd < rangeStart) continue;

            const startValue = toLocalDateTime(occStart);
            occurrences.push({
                event,
                start: occStart,
                end: occEnd,
                startValue,
                endValue: toLocalDateTime(occEnd),
                key: `${event.id}@${startValue}`,
            });
        }
    }

    return occurrences.sort((a, b) => {
        const allDay = Number(b.event.all_day) - Number(a.event.all_day);
        return allDay || a.start - b.start || a.end - b.end || a.event.id - b.event.id;
    });
}

// Chiavi dei giorni ("YYYY-MM-DD") occupati da un'occorrenza.
// Un evento che termina esattamente a mezzanotte non occupa il giorno successivo.
export function occurrenceDays(occurrence) {
    let last = occurrence.end;
    if (last > occurrence.start && last.getHours() === 0 && last.getMinutes() === 0) last = addDays(last, -1);
    const days = [];
    for (let d = new Date(occurrence.start); toDateKey(d) <= toDateKey(last); d = addDays(d, 1)) {
        days.push(toDateKey(d));
        if (days.length > 366) break;
    }
    return days;
}

// Raggruppa le occorrenze per giorno: Map<"YYYY-MM-DD", occorrenze[]>
export function groupByDay(occurrences) {
    const map = new Map();
    for (const occurrence of occurrences) {
        for (const day of occurrenceDays(occurrence)) {
            if (!map.has(day)) map.set(day, []);
            map.get(day).push(occurrence);
        }
    }
    return map;
}
