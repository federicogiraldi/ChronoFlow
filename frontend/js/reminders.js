// Disegno della lista dei promemoria.
import { addDays, formatTime, parseLocal, startOfDay, toDateKey } from './dates.js';
import { el } from './ui.js';

export const PRIORITY_LABELS = { low: 'Bassa', medium: 'Media', high: 'Alta' };

// Un promemoria è scaduto se la scadenza è passata (per le sole date: dal giorno dopo)
export function isOverdue(reminder, now = new Date()) {
    if (reminder.is_completed || !reminder.due_date) return false;
    if (reminder.due_date.length === 10) return reminder.due_date < toDateKey(now);
    return parseLocal(reminder.due_date) < now;
}

// Promemoria non completati in scadenza oggi o già scaduti (per il badge)
export function urgentCount(reminders, now = new Date()) {
    const today = toDateKey(now);
    return reminders.filter((r) => !r.is_completed && r.due_date && r.due_date.slice(0, 10) <= today).length;
}

function dueLabel(due, now = new Date()) {
    const day = due.slice(0, 10);
    const today = startOfDay(now);
    let dayText;
    if (day === toDateKey(today)) dayText = 'Oggi';
    else if (day === toDateKey(addDays(today, 1))) dayText = 'Domani';
    else if (day === toDateKey(addDays(today, -1))) dayText = 'Ieri';
    else {
        const date = parseLocal(day);
        dayText = date.toLocaleDateString('it-IT', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
        });
    }
    return due.length > 10 ? `${dayText}, ${formatTime(due)}` : dayText;
}

export function renderReminders(list, reminders, { showCompleted, onToggle, onEdit, onDelete }) {
    list.replaceChildren();
    const visible = showCompleted ? reminders : reminders.filter((r) => !r.is_completed);

    if (!visible.length) {
        list.append(
            el(
                'li',
                { className: 'empty-hint' },
                reminders.length
                    ? 'Tutti i promemoria sono completati 🎉'
                    : 'Nessun promemoria. Aggiungine uno qui sopra.'
            )
        );
        return;
    }

    for (const reminder of visible) {
        const id = `reminder-${reminder.id}`;
        const overdue = isOverdue(reminder);
        const item = el('li', {
            className: [
                'reminder-item',
                `priority-${reminder.priority}`,
                reminder.is_completed ? 'completed' : '',
                overdue ? 'overdue' : '',
            ]
                .filter(Boolean)
                .join(' '),
        });

        const checkbox = el('input', {
            type: 'checkbox',
            id,
            checked: reminder.is_completed,
            onchange: (e) => onToggle(reminder, e.target.checked),
        });

        const meta = el('div', { className: 'reminder-meta' });
        if (reminder.due_date) {
            meta.append(
                el(
                    'span',
                    { className: `due${overdue ? ' overdue' : ''}` },
                    overdue ? '⚠ Scaduto · ' : '🕑 ',
                    dueLabel(reminder.due_date)
                )
            );
        }
        if (reminder.priority !== 'medium') {
            meta.append(
                el(
                    'span',
                    { className: `priority-badge ${reminder.priority}` },
                    `Priorità ${PRIORITY_LABELS[reminder.priority].toLowerCase()}`
                )
            );
        }

        item.append(
            checkbox,
            el(
                'div',
                { className: 'reminder-body' },
                el('label', { for: id, className: 'reminder-title' }, reminder.title),
                meta.childElementCount ? meta : null
            ),
            el(
                'div',
                { className: 'reminder-actions' },
                el(
                    'button',
                    {
                        type: 'button',
                        className: 'icon-btn small',
                        'aria-label': `Modifica “${reminder.title}”`,
                        onclick: () => onEdit(reminder),
                    },
                    '✎'
                ),
                el(
                    'button',
                    {
                        type: 'button',
                        className: 'icon-btn small danger',
                        'aria-label': `Elimina “${reminder.title}”`,
                        onclick: () => onDelete(reminder),
                    },
                    '×'
                )
            )
        );
        list.append(item);
    }
}
