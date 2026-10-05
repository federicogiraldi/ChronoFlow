// Funzioni di utilità per le date.
// Le date degli eventi sono stringhe "YYYY-MM-DDTHH:MM" in ora locale (senza fuso orario),
// le date "pure" sono stringhe "YYYY-MM-DD" (chiavi dei giorni).

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const pad = (n) => String(n).padStart(2, '0');

// Date -> "YYYY-MM-DD"
export function toDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Date -> "YYYY-MM-DDTHH:MM"
export function toLocalDateTime(date) {
    return `${toDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM" -> Date (ora locale)
export function parseLocal(value) {
    const [datePart, timePart = '00:00'] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Somma mesi senza "sforare": 31 gennaio + 1 mese = 28/29 febbraio
export function addMonthsClamped(date, months) {
    const target = new Date(
        date.getFullYear(),
        date.getMonth() + months,
        1,
        date.getHours(),
        date.getMinutes()
    );
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDay));
    return target;
}

export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Lunedì della settimana che contiene la data
export function startOfWeek(date) {
    const day = (date.getDay() + 6) % 7; // 0 = lunedì
    return addDays(startOfDay(date), -day);
}

export function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Giorni della griglia mensile: settimane complete da lunedì a domenica
export function monthGridDays(date) {
    const first = startOfMonth(date);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
}

// Differenza in giorni di calendario tra due date (ignora l'ora e il cambio dell'ora legale)
export function diffDays(a, b) {
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / 86400000);
}

export function isSameDay(a, b) {
    return toDateKey(a) === toDateKey(b);
}

export function formatTime(value) {
    return value.split('T')[1]?.slice(0, 5) ?? '';
}

export function formatDate(date, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
    return date.toLocaleDateString('it-IT', options);
}

export function formatDateTime(value, allDay = false) {
    const date = parseLocal(value);
    if (allDay)
        return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return date.toLocaleString('it-IT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
