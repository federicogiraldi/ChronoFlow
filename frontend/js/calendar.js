// Disegno delle viste del calendario: mese, settimana, giorno e risultati di ricerca.
import {
    WEEKDAYS_SHORT,
    addDays,
    capitalize,
    formatDate,
    formatDateTime,
    formatTime,
    isSameDay,
    monthGridDays,
    parseLocal,
    startOfDay,
    startOfWeek,
    toDateKey,
} from './dates.js';
import { RECURRENCE_LABELS, expandOccurrences, groupByDay } from './recurrence.js';
import { el } from './ui.js';

// Etichetta del periodo visualizzato (es. "Ottobre 2026")
export function periodLabel(view, date) {
    if (view === 'month') return capitalize(formatDate(date, { month: 'long', year: 'numeric' }));
    if (view === 'day')
        return capitalize(
            formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        );
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startText = formatDate(start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    return `${startText} – ${formatDate(end, { day: 'numeric', month: sameMonth ? 'long' : 'short', year: 'numeric' })}`;
}

// Data spostata di un periodo avanti (+1) o indietro (-1)
export function shiftDate(view, date, direction) {
    if (view === 'month') return new Date(date.getFullYear(), date.getMonth() + direction, 1);
    return addDays(date, view === 'week' ? 7 * direction : direction);
}

// Orario mostrato per un'occorrenza in un certo giorno
function timeLabel(occurrence, dayKey) {
    if (occurrence.event.all_day) return 'Tutto il giorno';
    const startKey = toDateKey(occurrence.start);
    const endKey = toDateKey(occurrence.end);
    const start = startKey === dayKey ? formatTime(occurrence.startValue) : '…';
    const end = endKey === dayKey ? formatTime(occurrence.endValue) : '…';
    return `${start} – ${end}`;
}

// Il colore dell'evento arriva al CSS come variabile --ev (sfondo tenue + bordo pieno)
function colorStyle(color) {
    return { '--ev': color };
}

function eventChip(occurrence, dayKey, onOpenEvent) {
    const { event } = occurrence;
    const continues = toDateKey(occurrence.start) !== dayKey;
    const time = !event.all_day && !continues ? formatTime(occurrence.startValue) : '';
    return el(
        'button',
        {
            type: 'button',
            className: `event-chip${event.all_day ? ' all-day' : ''}`,
            style: colorStyle(event.color),
            title: `${event.title} · ${timeLabel(occurrence, dayKey)}`,
            onclick: (e) => {
                e.stopPropagation();
                onOpenEvent(occurrence);
            },
        },
        continues ? '« ' : null,
        time ? el('span', { className: 'chip-time' }, time) : null,
        el('span', { className: 'chip-title' }, event.title)
    );
}

function dayLabel(day, count) {
    return `${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}${
        count ? `, ${count} ${count === 1 ? 'evento' : 'eventi'}` : ''
    }`;
}

// Cella del mese su desktop: numero del giorno ed eventi come etichette colorate
function monthCell(day, list, { key, maxChips, onOpenDay, onCreateAt, onOpenEvent }) {
    const cell = el('div', { onclick: () => onCreateAt(day) });
    cell.append(
        el(
            'button',
            {
                type: 'button',
                className: 'day-number',
                'aria-label': `${dayLabel(day, list.length)}. Apri il giorno`,
                onclick: (e) => {
                    e.stopPropagation();
                    onOpenDay(day);
                },
            },
            day.getDate()
        )
    );
    const visible = list.length > maxChips ? list.slice(0, maxChips - 1) : list;
    const chips = el(
        'div',
        { className: 'day-events' },
        visible.map((o) => eventChip(o, key, onOpenEvent))
    );
    if (list.length > visible.length) {
        chips.append(
            el(
                'button',
                {
                    type: 'button',
                    className: 'more-btn',
                    onclick: (e) => {
                        e.stopPropagation();
                        onOpenDay(day);
                    },
                },
                `+${list.length - visible.length} altri`
            )
        );
    }
    cell.append(chips);
    return cell;
}

// Cella del mese su smartphone: numero del giorno e un pallino per evento.
// Toccandola si seleziona il giorno, i cui eventi compaiono sotto la griglia.
function compactCell(day, list, { selected, onSelectDay }) {
    const cell = el('div');
    cell.append(
        el(
            'button',
            {
                type: 'button',
                className: 'day-select',
                'aria-label': dayLabel(day, list.length),
                'aria-pressed': String(selected),
                onclick: () => onSelectDay(day),
            },
            el('span', { className: 'day-number' }, day.getDate()),
            el(
                'span',
                { className: 'day-dots', 'aria-hidden': 'true' },
                list
                    .slice(0, 3)
                    .map((o) => el('span', { className: 'dot', style: colorStyle(o.event.color) })),
                list.length > 3 ? el('span', { className: 'dot more' }) : null
            )
        )
    );
    return cell;
}

// Elenco degli eventi del giorno selezionato (sotto la griglia del mese su smartphone)
function renderAgenda(container, { day, events, onCreateAt, onOpenEvent }) {
    const key = toDateKey(day);
    const list = groupByDay(expandOccurrences(events, day, addDays(day, 1))).get(key) || [];
    container.append(
        el(
            'section',
            { className: 'agenda', 'aria-labelledby': 'agenda-title' },
            el(
                'div',
                { className: 'agenda-header' },
                el(
                    'h3',
                    { id: 'agenda-title' },
                    capitalize(formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }))
                ),
                el(
                    'button',
                    { type: 'button', className: 'btn-link', onclick: () => onCreateAt(day) },
                    '+ Aggiungi'
                )
            ),
            list.length
                ? el(
                      'div',
                      { className: 'day-events-list' },
                      list.map((o) => eventCard(o, key, onOpenEvent))
                  )
                : el('p', { className: 'empty-hint' }, 'Nessun evento in questa giornata.')
        )
    );
}

function renderMonth(container, options) {
    const { date, events, compact, selectedDate } = options;
    const days = monthGridDays(date);
    const byDay = groupByDay(expandOccurrences(events, days[0], addDays(days.at(-1), 1)));
    const today = new Date();

    const grid = el('div', {
        className: `month-grid${compact ? ' compact' : ''}`,
        role: 'grid',
        'aria-label': periodLabel('month', date),
    });
    grid.append(
        el(
            'div',
            { className: 'month-row weekday-row', role: 'row' },
            WEEKDAYS_SHORT.map((name) => el('div', { className: 'weekday', role: 'columnheader' }, name))
        )
    );

    for (let w = 0; w < days.length; w += 7) {
        const row = el('div', { className: 'month-row', role: 'row' });
        for (const day of days.slice(w, w + 7)) {
            const key = toDateKey(day);
            const list = byDay.get(key) || [];
            const isToday = isSameDay(day, today);
            const selected = compact && isSameDay(day, selectedDate);
            const cell = compact
                ? compactCell(day, list, { selected, onSelectDay: options.onSelectDay })
                : monthCell(day, list, { key, ...options });
            cell.className = [
                'day-cell',
                day.getMonth() !== date.getMonth() ? 'outside' : '',
                isToday ? 'today' : '',
                selected ? 'selected' : '',
            ]
                .filter(Boolean)
                .join(' ');
            cell.setAttribute('role', 'gridcell');
            if (isToday) cell.setAttribute('aria-current', 'date');
            cell.dataset.date = key;
            row.append(cell);
        }
        grid.append(row);
    }
    container.append(grid);
    if (compact) renderAgenda(container, { day: selectedDate, ...options });
}

function eventCard(occurrence, dayKey, onOpenEvent) {
    const { event } = occurrence;
    return el(
        'button',
        {
            type: 'button',
            className: 'event-card',
            onclick: (e) => {
                e.stopPropagation();
                onOpenEvent(occurrence);
            },
        },
        el('span', {
            className: 'event-color',
            style: colorStyle(event.color),
            'aria-hidden': 'true',
        }),
        el(
            'span',
            { className: 'event-card-body' },
            el('span', { className: 'event-card-time' }, timeLabel(occurrence, dayKey)),
            el('span', { className: 'event-card-title' }, event.title),
            event.category ? el('span', { className: 'event-card-meta' }, event.category) : null,
            event.recurrence !== 'none'
                ? el('span', { className: 'event-card-meta' }, `↻ ${RECURRENCE_LABELS[event.recurrence]}`)
                : null
        )
    );
}

function renderWeek(container, { date, events, onOpenDay, onCreateAt, onOpenEvent }) {
    const start = startOfWeek(date);
    const byDay = groupByDay(expandOccurrences(events, start, addDays(start, 7)));
    const today = new Date();
    const week = el('div', { className: 'week-grid' });

    for (let i = 0; i < 7; i++) {
        const day = addDays(start, i);
        const key = toDateKey(day);
        const list = byDay.get(key) || [];
        const column = el('section', {
            className: `week-day${isSameDay(day, today) ? ' today' : ''}`,
            'aria-label': formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }),
            onclick: () => onCreateAt(day),
        });
        column.append(
            el(
                'button',
                {
                    type: 'button',
                    className: 'week-day-header',
                    'aria-current': isSameDay(day, today) ? 'date' : null,
                    onclick: (e) => {
                        e.stopPropagation();
                        onOpenDay(day);
                    },
                },
                el('span', { className: 'week-day-name' }, WEEKDAYS_SHORT[i]),
                el('span', { className: 'week-day-number' }, day.getDate())
            ),
            el(
                'div',
                { className: 'week-day-events' },
                list.length
                    ? list.map((o) => eventCard(o, key, onOpenEvent))
                    : el('p', { className: 'empty-hint' }, 'Nessun evento')
            )
        );
        week.append(column);
    }
    container.append(week);
}

function renderDay(container, { date, events, onCreateAt, onOpenEvent }) {
    const day = startOfDay(date);
    const key = toDateKey(day);
    const list = groupByDay(expandOccurrences(events, day, addDays(day, 1))).get(key) || [];
    const wrapper = el('div', { className: 'day-view' });
    if (!list.length) {
        wrapper.append(
            el(
                'div',
                { className: 'empty-state' },
                el('p', {}, 'Nessun evento in questa giornata.'),
                el(
                    'button',
                    { type: 'button', className: 'btn btn-primary', onclick: () => onCreateAt(day) },
                    '+ Aggiungi evento'
                )
            )
        );
    } else {
        wrapper.append(
            el(
                'div',
                { className: 'day-events-list' },
                list.map((o) => eventCard(o, key, onOpenEvent))
            )
        );
    }
    container.append(wrapper);
}

export function renderCalendar(container, options) {
    container.replaceChildren();
    container.dataset.view = options.view;
    if (options.view === 'week') renderWeek(container, options);
    else if (options.view === 'day') renderDay(container, options);
    else renderMonth(container, options);
}

// Elenco degli eventi che corrispondono alla ricerca (le serie ricorrenti compaiono una volta)
export function renderSearchResults(container, { events, query, onOpenEvent }) {
    container.replaceChildren();
    container.dataset.view = 'search';
    const sorted = [...events].sort((a, b) => b.start_datetime.localeCompare(a.start_datetime));
    const wrapper = el('div', { className: 'search-results' });
    wrapper.append(
        el(
            'p',
            { className: 'search-summary', role: 'status' },
            `${sorted.length} ${sorted.length === 1 ? 'risultato' : 'risultati'} per “${query}”`
        )
    );
    if (sorted.length) {
        wrapper.append(
            el(
                'div',
                { className: 'day-events-list' },
                sorted.map((event) => {
                    const start = parseLocal(event.start_datetime);
                    const occurrence = {
                        event,
                        start,
                        end: parseLocal(event.end_datetime),
                        startValue: event.start_datetime,
                        endValue: event.end_datetime,
                        key: `${event.id}@${event.start_datetime}`,
                    };
                    const card = eventCard(occurrence, toDateKey(start), onOpenEvent);
                    card.querySelector('.event-card-time').textContent = formatDateTime(
                        event.start_datetime,
                        event.all_day
                    );
                    return card;
                })
            )
        );
    }
    container.append(wrapper);
}
