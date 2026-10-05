// Import/export in formato iCalendar (.ics, RFC 5545), compatibile con
// Google Calendar, Apple Calendario e Outlook.
// Gli orari vengono esportati come "floating" (ora locale senza fuso), come sono salvati in ChronoFlow.
import { addDays, addMonthsClamped, parseLocal, toDateKey, toLocalDateTime } from './dates.js';

const FREQS = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
const pad = (n) => String(n).padStart(2, '0');

// ===================== EXPORT =====================

function escapeText(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

// Le righe più lunghe di 75 byte vanno "piegate" (continuazione con uno spazio iniziale)
function foldLine(line) {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    const parts = [];
    let current = '';
    for (const char of line) {
        const limit = parts.length ? 74 : 75;
        if (encoder.encode(current + char).length > limit) {
            parts.push(current);
            current = char;
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts.join('\r\n ');
}

const icsDate = (key) => key.replace(/-/g, '');
const icsDateTime = (value) => `${value.replace(/[-:]/g, '')}00`;

function utcStamp(date) {
    return (
        `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
        `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
}

export function buildICS(events, now = new Date()) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ChronoFlow//Calendario//IT',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:ChronoFlow',
    ];
    for (const event of events) {
        lines.push('BEGIN:VEVENT', `UID:chronoflow-${event.id}@chronoflow`, `DTSTAMP:${utcStamp(now)}`);
        if (event.all_day) {
            const endKey = toDateKey(addDays(parseLocal(event.end_datetime.slice(0, 10)), 1));
            lines.push(`DTSTART;VALUE=DATE:${icsDate(event.start_datetime.slice(0, 10))}`);
            lines.push(`DTEND;VALUE=DATE:${icsDate(endKey)}`); // DTEND è esclusivo
        } else {
            lines.push(`DTSTART:${icsDateTime(event.start_datetime)}`);
            lines.push(`DTEND:${icsDateTime(event.end_datetime)}`);
        }
        lines.push(`SUMMARY:${escapeText(event.title)}`);
        if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
        if (event.category) lines.push(`CATEGORIES:${escapeText(event.category)}`);
        if (event.recurrence && event.recurrence !== 'none') {
            let rule = `RRULE:FREQ=${FREQS[event.recurrence]}`;
            if (event.recurrence_until) {
                const until = icsDate(event.recurrence_until);
                rule += event.all_day ? `;UNTIL=${until}` : `;UNTIL=${until}T235959`;
            }
            lines.push(rule);
        }
        if (event.notify_minutes !== null && event.notify_minutes !== undefined) {
            lines.push(
                'BEGIN:VALARM',
                'ACTION:DISPLAY',
                `DESCRIPTION:${escapeText(event.title)}`,
                `TRIGGER:-PT${event.notify_minutes}M`,
                'END:VALARM'
            );
        }
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
}

// ===================== IMPORT =====================

function unescapeText(text) {
    return text.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// "NOME;PARAM=val;PARAM2=val:valore" -> { name, params, value }
function parseLine(line) {
    let inQuotes = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === ':' && !inQuotes) {
            colon = i;
            break;
        }
    }
    if (colon < 0) return null;
    const [name, ...rawParams] = line.slice(0, colon).split(';');
    const params = {};
    for (const p of rawParams) {
        const [k, v = ''] = p.split('=');
        params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
    }
    return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// Converte una data iCalendar in { value: "YYYY-MM-DDTHH:MM", dateOnly }
// - "20261005" o VALUE=DATE -> giorno intero
// - "20261005T100000Z" -> UTC, convertita nell'ora locale del browser
// - "20261005T100000" (anche con TZID) -> ora locale
function parseIcsDate(prop) {
    if (!prop) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim());
    if (!m) return null;
    const [, y, mo, d, hh, mm, , z] = m;
    if (prop.params.VALUE === 'DATE' || hh === undefined) {
        return { value: `${y}-${mo}-${d}T00:00`, dateOnly: true };
    }
    if (z) {
        const date = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
        return { value: toLocalDateTime(date), dateOnly: false };
    }
    return { value: `${y}-${mo}-${d}T${hh}:${mm}`, dateOnly: false };
}

// Durata ISO 8601 (es. "PT1H30M", "P1D", "-PT15M") -> minuti
function parseDuration(text) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(text.trim());
    if (!m) return null;
    const [, sign, w = 0, d = 0, h = 0, min = 0, s = 0] = m;
    const minutes = +w * 10080 + +d * 1440 + +h * 60 + +min + Math.floor(+s / 60);
    return sign === '-' ? -minutes : minutes;
}

function addMinutes(value, minutes) {
    const date = parseLocal(value);
    date.setMinutes(date.getMinutes() + minutes);
    return toLocalDateTime(date);
}

// Data di fine ricorrenza a partire da COUNT (numero di occorrenze)
function untilFromCount(startValue, recurrence, count) {
    const start = parseLocal(startValue);
    const steps = count - 1;
    if (recurrence === 'daily') return toDateKey(addDays(start, steps));
    if (recurrence === 'weekly') return toDateKey(addDays(start, 7 * steps));
    if (recurrence === 'monthly') return toDateKey(addMonthsClamped(start, steps));
    return toDateKey(addMonthsClamped(start, 12 * steps));
}

function convertEvent(props, alarmMinutes, warnings) {
    const start = parseIcsDate(props.DTSTART);
    if (!start) return null;
    const allDay = start.dateOnly;

    let endValue;
    const end = parseIcsDate(props.DTEND);
    if (end) {
        // Per gli eventi di tutto il giorno DTEND è esclusivo: togliamo un giorno
        endValue = allDay ? toLocalDateTime(addDays(parseLocal(end.value), -1)) : end.value;
    } else if (props.DURATION) {
        endValue = addMinutes(start.value, parseDuration(props.DURATION.value) ?? 0);
        if (allDay) endValue = addMinutes(endValue, -1);
    } else {
        endValue = start.value;
    }
    if (endValue < start.value) endValue = start.value;

    let recurrence = 'none';
    let recurrenceUntil = null;
    if (props.RRULE) {
        const rule = Object.fromEntries(
            props.RRULE.value.split(';').map((part) => {
                const [k, v = ''] = part.split('=');
                return [k.toUpperCase(), v];
            })
        );
        const freq = Object.keys(FREQS).find((key) => FREQS[key] === rule.FREQ);
        const simple = freq && (!rule.INTERVAL || rule.INTERVAL === '1') && !rule.BYSETPOS;
        if (simple) {
            recurrence = freq;
            if (rule.UNTIL)
                recurrenceUntil = parseIcsDate({ value: rule.UNTIL, params: {} })?.value.slice(0, 10);
            else if (rule.COUNT) recurrenceUntil = untilFromCount(start.value, freq, Number(rule.COUNT));
        } else {
            // Regole complesse (es. ogni 2 settimane, il primo lunedì del mese) non sono supportate:
            // importiamo solo la prima occorrenza
            warnings.push(
                `"${props.SUMMARY ? unescapeText(props.SUMMARY.value) : 'Evento'}": ripetizione non supportata, importata solo la prima occorrenza`
            );
        }
    }

    const title = props.SUMMARY ? unescapeText(props.SUMMARY.value).trim() : '';
    const description = props.DESCRIPTION ? unescapeText(props.DESCRIPTION.value).trim() : '';
    const category = props.CATEGORIES ? unescapeText(props.CATEGORIES.value).split(',')[0].trim() : '';

    return {
        title: (title || '(Senza titolo)').slice(0, 200),
        description: description.slice(0, 2000) || null,
        start_datetime: start.value,
        end_datetime: allDay ? `${endValue.slice(0, 10)}T23:59` : endValue,
        all_day: allDay,
        category: category.slice(0, 50) || null,
        recurrence,
        recurrence_until: recurrence === 'none' ? null : recurrenceUntil,
        notify_minutes: alarmMinutes,
    };
}

// Legge il testo di un file .ics e restituisce { events, warnings }
export function parseICS(text) {
    const lines = String(text)
        .replace(/\r?\n[ \t]/g, '') // "unfolding" delle righe piegate
        .split(/\r?\n/);
    const events = [];
    const warnings = [];
    let props = null;
    let inAlarm = false;
    let alarmMinutes = null;

    for (const raw of lines) {
        const line = parseLine(raw);
        if (!line) continue;
        if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') {
            props = {};
            alarmMinutes = null;
        } else if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VALARM') {
            inAlarm = true;
        } else if (line.name === 'END' && line.value.toUpperCase() === 'VALARM') {
            inAlarm = false;
        } else if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') {
            // Le modifiche a singole occorrenze (RECURRENCE-ID) e gli eventi annullati vengono ignorati
            const skip =
                !props || props['RECURRENCE-ID'] || props.STATUS?.value.toUpperCase() === 'CANCELLED';
            if (!skip) {
                const event = convertEvent(props, alarmMinutes, warnings);
                if (event) events.push(event);
                else warnings.push('Evento senza data di inizio valida ignorato');
            }
            props = null;
        } else if (props && inAlarm) {
            if (line.name === 'TRIGGER' && alarmMinutes === null && line.params.RELATED !== 'END') {
                const minutes = parseDuration(line.value);
                if (minutes !== null && minutes <= 0) alarmMinutes = Math.min(-minutes, 10080);
            }
        } else if (props && !(line.name in props)) {
            props[line.name] = line;
        }
    }
    return { events, warnings };
}
