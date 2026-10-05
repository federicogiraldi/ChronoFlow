// Validazione e normalizzazione dei dati in ingresso.
// Ogni funzione restituisce { value } se i dati sono validi, altrimenti { errors: { campo: messaggio } }.

export const PRIORITIES = ['low', 'medium', 'high'];
export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
export const DEFAULT_COLOR = '#3788d8';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isRealDate(y, m, d) {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// "YYYY-MM-DD" -> stessa stringa se la data esiste, altrimenti null
export function normalizeDate(value) {
    if (typeof value !== 'string') return null;
    const m = DATE_RE.exec(value.trim());
    if (!m || !isRealDate(+m[1], +m[2], +m[3])) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
}

// "YYYY-MM-DDTHH:MM[:SS]" (ora locale, senza fuso) -> "YYYY-MM-DDTHH:MM", altrimenti null
export function normalizeDateTime(value) {
    if (typeof value !== 'string') return null;
    const m = DATETIME_RE.exec(value.trim());
    if (!m || !isRealDate(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

function toBoolean(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return undefined;
}

function optionalText(value, max, field, errors) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        errors[field] = 'Deve essere un testo';
        return null;
    }
    const text = value.trim();
    if (text.length > max) errors[field] = `Massimo ${max} caratteri`;
    return text || null;
}

function requiredTitle(value, errors) {
    if (typeof value !== 'string' || !value.trim()) {
        errors.title = 'Il titolo è obbligatorio';
        return '';
    }
    const title = value.trim();
    if (title.length > 200) errors.title = 'Massimo 200 caratteri';
    return title;
}

function result(value, errors) {
    return Object.keys(errors).length ? { errors } : { value };
}

export function validateEvent(input) {
    const body = input && typeof input === 'object' ? input : {};
    const errors = {};

    const title = requiredTitle(body.title, errors);
    const description = optionalText(body.description, 2000, 'description', errors);
    const category = optionalText(body.category, 50, 'category', errors);

    const allDay = body.all_day === undefined ? false : toBoolean(body.all_day);
    if (allDay === undefined) errors.all_day = 'Valore non valido';

    let start = normalizeDateTime(body.start_datetime) ?? normalizeDate(body.start_datetime);
    let end = normalizeDateTime(body.end_datetime) ?? normalizeDate(body.end_datetime);
    if (!start) errors.start_datetime = 'Data di inizio non valida';
    if (!end) errors.end_datetime = 'Data di fine non valida';
    if (start && end) {
        if (allDay) {
            // Eventi di tutto il giorno: occupano interamente i giorni indicati
            start = `${start.slice(0, 10)}T00:00`;
            end = `${end.slice(0, 10)}T23:59`;
        } else {
            if (start.length === 10) start += 'T00:00';
            if (end.length === 10) end += 'T00:00';
        }
        if (end < start) errors.end_datetime = 'La fine non può precedere l’inizio';
    }

    let color = DEFAULT_COLOR;
    if (body.color !== undefined && body.color !== null && body.color !== '') {
        if (typeof body.color === 'string' && COLOR_RE.test(body.color)) color = body.color.toLowerCase();
        else errors.color = 'Colore non valido (formato #rrggbb)';
    }

    const recurrence = body.recurrence ?? 'none';
    if (!RECURRENCES.includes(recurrence)) errors.recurrence = 'Ricorrenza non valida';

    let recurrenceUntil = null;
    if (recurrence !== 'none' && body.recurrence_until) {
        recurrenceUntil = normalizeDate(body.recurrence_until);
        if (!recurrenceUntil) errors.recurrence_until = 'Data di fine ricorrenza non valida';
        else if (start && recurrenceUntil < start.slice(0, 10))
            errors.recurrence_until = 'La ricorrenza non può terminare prima dell’inizio';
    }

    let notifyMinutes = null;
    if (body.notify_minutes !== undefined && body.notify_minutes !== null && body.notify_minutes !== '') {
        notifyMinutes = Number(body.notify_minutes);
        if (!Number.isInteger(notifyMinutes) || notifyMinutes < 0 || notifyMinutes > 10080)
            errors.notify_minutes = 'Preavviso non valido (0–10080 minuti)';
    }

    return result(
        {
            title,
            description,
            start_datetime: start,
            end_datetime: end,
            all_day: allDay ? 1 : 0,
            color,
            category,
            recurrence,
            recurrence_until: recurrenceUntil,
            notify_minutes: notifyMinutes,
        },
        errors
    );
}

// partial = true per gli aggiornamenti parziali (PATCH): si validano solo i campi presenti
export function validateReminder(input, { partial = false } = {}) {
    const body = input && typeof input === 'object' ? input : {};
    const errors = {};
    const value = {};
    const has = (key) => !partial || Object.hasOwn(body, key);

    if (has('title')) value.title = requiredTitle(body.title, errors);

    if (has('due_date')) {
        if (body.due_date === undefined || body.due_date === null || body.due_date === '') {
            value.due_date = null;
        } else {
            value.due_date = normalizeDateTime(body.due_date) ?? normalizeDate(body.due_date);
            if (!value.due_date) errors.due_date = 'Scadenza non valida';
        }
    }

    if (has('priority')) {
        value.priority = body.priority ?? 'medium';
        if (!PRIORITIES.includes(value.priority)) errors.priority = 'Priorità non valida';
    }

    if (has('is_completed')) {
        const completed = body.is_completed === undefined ? false : toBoolean(body.is_completed);
        if (completed === undefined) errors.is_completed = 'Valore non valido';
        value.is_completed = completed ? 1 : 0;
    }

    if (partial && Object.keys(value).length === 0 && !Object.keys(errors).length) {
        errors._ = 'Nessun campo da aggiornare';
    }
    return result(value, errors);
}

// Gli id arrivano dall'URL come stringhe: accettiamo solo interi positivi
export function parseId(raw) {
    return /^[1-9]\d{0,15}$/.test(String(raw)) ? Number(raw) : null;
}
