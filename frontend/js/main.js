// Punto di ingresso del frontend: stato dell'applicazione, caricamento dati e gestione delle interazioni.
import { api, ApiError, onUnauthorized } from './api.js';
import { periodLabel, renderCalendar, renderSearchResults, shiftDate } from './calendar.js';
import { formatDateTime, parseLocal, startOfDay, toDateKey, toLocalDateTime } from './dates.js';
import { buildICS, parseICS } from './ics.js';
import * as notifications from './notifications.js';
import { RECURRENCE_LABELS } from './recurrence.js';
import { renderReminders, urgentCount } from './reminders.js';
import { THEME_LABELS, applyTheme, getTheme, nextTheme, setTheme } from './theme.js';
import {
    closeOnBackdrop,
    confirmDialog,
    downloadFile,
    el,
    icon,
    openDialog,
    showError,
    showToast,
} from './ui.js';

// Colori delle categorie, nello stesso ordine con cui il server li assegna alle nuove categorie
const COLORS = [
    ['#2e9e6b', 'Verde'],
    ['#8e5bd6', 'Viola'],
    ['#e8a33d', 'Arancione'],
    ['#d9534f', 'Rosso'],
    ['#d6569b', 'Rosa'],
    ['#2aa5b8', 'Turchese'],
    ['#6c757d', 'Grigio'],
    ['#3788d8', 'Blu'],
];
const NO_CATEGORY_COLOR = '#3788d8';
const NEW_CATEGORY = '__new__';
const NOTIFY_LABELS = {
    0: "All'inizio",
    5: '5 minuti prima',
    15: '15 minuti prima',
    30: '30 minuti prima',
    60: '1 ora prima',
    120: '2 ore prima',
    1440: '1 giorno prima',
};
const VIEWS = ['month', 'week', 'day'];
const mobileQuery = window.matchMedia('(max-width: 768px)');

// ==========================================
// STATO DELL'APPLICAZIONE
// ==========================================
const state = {
    view: readPref('cf-view', 'month'),
    date: new Date(),
    selectedDay: startOfDay(new Date()), // giorno selezionato nel mese su smartphone
    events: [],
    reminders: [],
    categories: [],
    editingCategory: null, // categoria aperta nel form (null = nuova)
    search: '',
    category: '',
    showCompleted: readPref('cf-show-completed', 'true') === 'true',
    editingEventId: null, // id dell'evento in modifica (null = nuovo)
    selectedOccurrence: null, // occorrenza aperta nei dettagli
    editingReminder: null,
    loadedAt: 0,
};
if (!VIEWS.includes(state.view)) state.view = 'month';

const $ = (id) => document.getElementById(id);

function readPref(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function writePref(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignorato: preferenza valida solo per questa sessione
    }
}

// ==========================================
// CARICAMENTO DATI
// ==========================================
async function loadData({ silent = false } = {}) {
    try {
        const [events, reminders, categories] = await Promise.all([
            api.listEvents(),
            api.listReminders(),
            api.listCategories(),
        ]);
        state.events = events;
        state.reminders = reminders;
        state.categories = categories;
        state.loadedAt = Date.now();
        render();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return; // gestito dal login
        if (silent) return;
        showError(error, 'Impossibile caricare i dati');
        renderLoadError();
    }
}

async function reloadEvents() {
    // Salvando un evento può nascere una nuova categoria: ricarichiamo anche quelle
    [state.events, state.categories] = await Promise.all([api.listEvents(), api.listCategories()]);
    renderCalendarArea();
    updateCategories();
}

async function reloadReminders() {
    state.reminders = await api.listReminders();
    renderRemindersArea();
}

function renderLoadError() {
    $('calendar').replaceChildren(
        el(
            'div',
            { className: 'empty-state' },
            el('p', {}, 'Non è stato possibile caricare il calendario.'),
            el(
                'button',
                { type: 'button', className: 'btn btn-primary', onclick: () => loadData() },
                'Riprova'
            )
        )
    );
}

// ==========================================
// RENDERING
// ==========================================
function render() {
    renderCalendarArea();
    renderRemindersArea();
    updateCategories();
}

function filteredEvents() {
    const query = state.search.trim().toLowerCase();
    return state.events.filter((event) => {
        if (state.category && event.category !== state.category) return false;
        if (!query) return true;
        return [event.title, event.description, event.category].some((text) =>
            text?.toLowerCase().includes(query)
        );
    });
}

function renderCalendarArea() {
    const container = $('calendar');
    const searching = state.search.trim() !== '';
    document.querySelectorAll('.view-switch button').forEach((button) => {
        button.setAttribute('aria-pressed', String(!searching && button.dataset.view === state.view));
    });
    if (searching) {
        $('period-label').textContent = 'Ricerca';
        $('period-label').classList.remove('long');
        renderSearchResults(container, {
            events: filteredEvents(),
            query: state.search.trim(),
            onOpenEvent: showDetails,
        });
        return;
    }
    const label = periodLabel(state.view, state.date);
    $('period-label').textContent = label;
    $('period-label').classList.toggle('long', label.length > 16);
    renderCalendar(container, {
        view: state.view,
        date: state.date,
        events: filteredEvents(),
        maxChips: 3,
        compact: mobileQuery.matches,
        selectedDate: state.selectedDay,
        onSelectDay: selectDay,
        onOpenDay: (day) => setView('day', day),
        onCreateAt: (day) => openEventForm({ day }),
        onOpenEvent: showDetails,
    });
}

function renderRemindersArea() {
    renderReminders($('reminders-list'), state.reminders, {
        showCompleted: state.showCompleted,
        onToggle: toggleReminder,
        onEdit: openReminderForm,
        onDelete: deleteReminder,
    });
    const urgent = urgentCount(state.reminders);
    const badge = $('reminders-badge');
    badge.hidden = urgent === 0;
    badge.textContent = urgent;
    $('reminders-toggle').setAttribute(
        'aria-label',
        urgent ? `Promemoria (${urgent} in scadenza)` : 'Promemoria'
    );
    $('clear-completed-btn').hidden = !state.reminders.some((r) => r.is_completed);
}

function updateCategories() {
    const categories = state.categories.map((c) => c.name);
    // Se la categoria filtrata è stata rinominata o eliminata, togliamo il filtro
    if (state.category && !categories.includes(state.category)) state.category = '';
    const select = $('category-filter');
    select.replaceChildren(
        el('option', { value: '' }, 'Tutte le categorie'),
        ...categories.map((c) => el('option', { value: c, selected: c === state.category }, c))
    );
    select.hidden = categories.length === 0;
}

function setView(view, date = state.date) {
    state.view = view;
    state.date = date;
    if (view !== 'month') state.selectedDay = startOfDay(date);
    writePref('cf-view', view);
    if (state.search) {
        state.search = '';
        $('search-input').value = '';
    }
    renderCalendarArea();
}

function navigate(direction) {
    state.date = direction === 0 ? new Date() : shiftDate(state.view, state.date, direction);
    // Nel mese si seleziona oggi se è nel mese mostrato, altrimenti il primo giorno
    const today = new Date();
    const sameMonth =
        state.date.getFullYear() === today.getFullYear() && state.date.getMonth() === today.getMonth();
    state.selectedDay =
        state.view === 'month' && !sameMonth
            ? new Date(state.date.getFullYear(), state.date.getMonth(), 1)
            : startOfDay(state.view === 'month' ? today : state.date);
    renderCalendarArea();
}

// Smartphone: tocco su un giorno del mese (se è del mese accanto, ci si sposta lì)
function selectDay(day) {
    state.selectedDay = day;
    if (day.getMonth() !== state.date.getMonth()) state.date = day;
    renderCalendarArea();
}

// Giorno proposto per un nuovo evento: quello mostrato o selezionato (nel mese su desktop, nessuno)
function newEventDay() {
    if (state.view !== 'month') return state.date;
    return mobileQuery.matches ? state.selectedDay : null;
}

function toggleSearch(open) {
    const header = document.querySelector('.app-header');
    const show = open ?? !header.classList.contains('search-open');
    header.classList.toggle('search-open', show);
    $('search-toggle').setAttribute('aria-expanded', String(show));
    if (show) {
        $('search-input').focus();
    } else if (state.search || $('search-input').value) {
        $('search-input').value = '';
        state.search = '';
        renderCalendarArea();
    }
}

// ==========================================
// EVENTI: FORM DI CREAZIONE / MODIFICA
// ==========================================
// Scelta della categoria: "pastiglie" colorate. Il colore non si sceglie qui: è quello della categoria.
function renderCategoryOptions(selected) {
    const chip = (value, label, color) =>
        el(
            'label',
            { className: 'category-chip' },
            el('input', { type: 'radio', name: 'category-choice', value, checked: value === selected }),
            el(
                'span',
                {},
                color ? el('span', { className: 'color-dot', style: { backgroundColor: color } }) : null,
                label
            )
        );
    $('category-options').replaceChildren(
        chip('', 'Nessuna', NO_CATEGORY_COLOR),
        ...state.categories.map((c) => chip(c.name, c.name, c.color)),
        chip(NEW_CATEGORY, '+ Nuova', null)
    );
    $('new-category-group').hidden = selected !== NEW_CATEGORY;
}

function selectedCategoryChoice() {
    return document.querySelector('input[name="category-choice"]:checked')?.value ?? '';
}

function onCategoryChoiceChange() {
    const isNew = selectedCategoryChoice() === NEW_CATEGORY;
    $('new-category-group').hidden = !isNew;
    if (isNew) $('event-new-category').focus();
}

function categoryByName(name) {
    return state.categories.find((c) => c.name.toLowerCase() === name?.toLowerCase());
}

// Cambia il tipo dei campi data tra "data e ora" e "solo data" (eventi di tutto il giorno)
function setAllDay(allDay) {
    const start = $('event-start');
    const end = $('event-end');
    const startValue = start.value;
    const endValue = end.value;
    start.type = end.type = allDay ? 'date' : 'datetime-local';
    if (allDay) {
        start.value = startValue.slice(0, 10);
        end.value = endValue.slice(0, 10);
    } else {
        start.value = startValue ? `${startValue.slice(0, 10)}T${startValue.slice(11, 16) || '09:00'}` : '';
        end.value = endValue ? `${endValue.slice(0, 10)}T${endValue.slice(11, 16) || '10:00'}` : '';
    }
}

function nextFullHour() {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    return date;
}

function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((p) => (p.textContent = ''));
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
}

function showFieldErrors(form, errors) {
    let first = null;
    for (const [field, message] of Object.entries(errors)) {
        const target = form.querySelector(`[data-error-for="${field}"]`);
        if (target) target.textContent = message;
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            input.setAttribute('aria-invalid', 'true');
            first ??= input;
        }
    }
    first?.focus();
}

// options: { event } per modificare, { copyOf } per duplicare, { day } per un nuovo evento in quel giorno
function openEventForm({ event = null, copyOf = null, day = null } = {}) {
    const form = $('event-form');
    form.reset();
    clearErrors(form);
    const source = event || copyOf;
    state.editingEventId = event ? event.id : null;
    $('event-dialog-title').textContent = event
        ? 'Modifica evento'
        : copyOf
          ? 'Duplica evento'
          : 'Nuovo evento';

    let start;
    let end;
    if (source) {
        start = source.start_datetime;
        end = source.end_datetime;
    } else {
        // Nuovo evento: alle 9:00 del giorno scelto, oppure alla prossima ora piena se è oggi
        let startDate = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9) : nextFullHour();
        if (day && toDateKey(day) === toDateKey(new Date())) startDate = nextFullHour();
        start = toLocalDateTime(startDate);
        end = toLocalDateTime(new Date(startDate.getTime() + 60 * 60 * 1000));
    }

    const allDay = Boolean(source?.all_day);
    $('event-all-day').checked = allDay;
    $('event-start').type = $('event-end').type = 'datetime-local';
    $('event-start').value = start;
    $('event-end').value = end;
    setAllDay(allDay);

    $('event-title').value = source?.title ?? '';
    $('event-description').value = source?.description ?? '';
    // Nuovo evento: proponiamo la categoria filtrata, se c'è
    const category = categoryByName(source ? source.category : state.category);
    renderCategoryOptions(category ? category.name : '');
    $('event-new-category').value = '';
    $('event-recurrence').value = source?.recurrence ?? 'none';
    $('event-recurrence-until').value = source?.recurrence_until ?? '';
    $('event-notify').value = source?.notify_minutes ?? '';
    updateRecurrenceFields();

    openDialog($('event-dialog'));
    $('event-title').focus();
}

function updateRecurrenceFields() {
    const recurring = $('event-recurrence').value !== 'none';
    $('recurrence-until-group').hidden = !recurring;
    $('recurrence-note').hidden = !(recurring && state.editingEventId);
}

function readEventForm() {
    const allDay = $('event-all-day').checked;
    const recurrence = $('event-recurrence').value;
    const notify = $('event-notify').value;
    return {
        title: $('event-title').value.trim(),
        description: $('event-description').value.trim() || null,
        category: readCategory(),
        all_day: allDay,
        start_datetime: $('event-start').value,
        end_datetime: $('event-end').value,
        recurrence,
        recurrence_until: recurrence !== 'none' ? $('event-recurrence-until').value || null : null,
        notify_minutes: notify === '' ? null : Number(notify),
    };
}

function readCategory() {
    const choice = selectedCategoryChoice();
    if (choice === NEW_CATEGORY) return $('event-new-category').value.trim() || null;
    return choice || null;
}

function validateEventForm(data) {
    const errors = {};
    if (selectedCategoryChoice() === NEW_CATEGORY && !data.category) {
        errors.category = 'Scrivi il nome della nuova categoria';
    }
    if (!data.title) errors.title = 'Inserisci un titolo';
    if (!data.start_datetime) errors.start_datetime = 'Indica quando inizia';
    if (!data.end_datetime) errors.end_datetime = 'Indica quando finisce';
    if (data.start_datetime && data.end_datetime && data.end_datetime < data.start_datetime) {
        errors.end_datetime = 'La fine non può precedere l’inizio';
    }
    if (
        data.recurrence_until &&
        data.start_datetime &&
        data.recurrence_until < data.start_datetime.slice(0, 10)
    ) {
        errors.recurrence_until = 'Deve essere successiva all’inizio';
    }
    return errors;
}

async function saveEvent(e) {
    e.preventDefault();
    const form = $('event-form');
    clearErrors(form);
    const data = readEventForm();
    const errors = validateEventForm(data);
    if (Object.keys(errors).length) return showFieldErrors(form, errors);

    const button = $('save-event-btn');
    button.disabled = true;
    try {
        if (state.editingEventId) await api.updateEvent(state.editingEventId, data);
        else await api.createEvent(data);
        $('event-dialog').close();
        showToast(state.editingEventId ? 'Evento aggiornato' : 'Evento creato', 'success');
        // Mostriamo il periodo in cui si trova l'evento appena salvato
        if (!state.search) {
            state.date = parseLocal(data.start_datetime);
            state.selectedDay = startOfDay(state.date);
        }
        await reloadEvents();
    } catch (error) {
        if (error instanceof ApiError && error.details) showFieldErrors(form, error.details);
        else showError(error, 'Impossibile salvare l’evento');
    } finally {
        button.disabled = false;
    }
}

// Quando cambia l'inizio, spostiamo anche la fine mantenendo la durata
let previousStart = '';
function onStartFocus() {
    previousStart = $('event-start').value;
}
function onStartChange() {
    const start = $('event-start').value;
    const end = $('event-end').value;
    if (!previousStart || !start || !end) return;
    const delta = parseLocal(start) - parseLocal(previousStart);
    const newEnd = new Date(parseLocal(end).getTime() + delta);
    $('event-end').value = $('event-all-day').checked ? toDateKey(newEnd) : toLocalDateTime(newEnd);
    previousStart = start;
}

// ==========================================
// EVENTI: DETTAGLI ED ELIMINAZIONE
// ==========================================
function showDetails(occurrence) {
    state.selectedOccurrence = occurrence;
    const { event } = occurrence;
    $('details-title-text').textContent = event.title;
    $('details-color').style.backgroundColor = event.color;

    const rows = [];
    const add = (label, value, className) => {
        rows.push(el('dt', {}, label), el('dd', { className }, value));
    };
    const start = formatDateTime(occurrence.startValue, event.all_day);
    const end = formatDateTime(occurrence.endValue, event.all_day);
    add(
        'Quando',
        event.all_day
            ? start === end
                ? `${start} · tutto il giorno`
                : `${start} → ${end}`
            : `${start} → ${end}`
    );
    if (event.recurrence !== 'none') {
        const until = event.recurrence_until
            ? ` fino al ${parseLocal(event.recurrence_until).toLocaleDateString('it-IT')}`
            : '';
        add('Ripetizione', `${RECURRENCE_LABELS[event.recurrence]}${until}`);
    }
    if (event.notify_minutes !== null)
        add('Notifica', NOTIFY_LABELS[event.notify_minutes] ?? `${event.notify_minutes} minuti prima`);
    if (event.category) {
        add('Categoria', [
            el('span', { className: 'color-dot', style: { backgroundColor: event.color } }),
            ` ${event.category}`,
        ]);
    }
    if (event.description) add('Descrizione', event.description, 'description');
    $('details-list').replaceChildren(...rows);

    openDialog($('details-dialog'));
}

async function deleteSelectedEvent() {
    const { event } = state.selectedOccurrence;
    const recurring = event.recurrence !== 'none';
    const confirmed = await confirmDialog({
        title: 'Eliminare l’evento?',
        message: recurring
            ? `“${event.title}” si ripete: verranno eliminate tutte le ripetizioni.`
            : `“${event.title}” verrà eliminato definitivamente.`,
        confirmLabel: 'Elimina',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await api.deleteEvent(event.id);
        $('details-dialog').close();
        showToast('Evento eliminato', 'success');
        await reloadEvents();
    } catch (error) {
        showError(error, 'Impossibile eliminare l’evento');
    }
}

// ==========================================
// CATEGORIE E COLORI
// ==========================================
function setupCategoryColors() {
    $('category-colors').replaceChildren(
        ...COLORS.map(([value, name]) =>
            el(
                'label',
                { className: 'color-option', title: name },
                el('input', { type: 'radio', name: 'color', value, 'aria-label': name }),
                el('span', { className: 'swatch', style: { backgroundColor: value }, 'aria-hidden': 'true' })
            )
        )
    );
}

// Primo colore non ancora usato da un'altra categoria (come fa il server)
function suggestedColor() {
    const used = state.categories.map((c) => c.color);
    return COLORS.map(([value]) => value).find((c) => !used.includes(c)) ?? COLORS[0][0];
}

function renderCategoryManager() {
    const list = $('category-manage-list');
    if (!state.categories.length) {
        list.replaceChildren(
            el(
                'li',
                { className: 'empty-hint' },
                'Nessuna categoria. Creane una qui sotto o dal form di un evento.'
            )
        );
        return;
    }
    list.replaceChildren(
        ...state.categories.map((category) =>
            el(
                'li',
                {},
                el(
                    'button',
                    {
                        type: 'button',
                        className: 'category-row',
                        'aria-label': `Modifica la categoria ${category.name}`,
                        onclick: () => openCategoryForm(category),
                    },
                    el('span', { className: 'swatch', style: { backgroundColor: category.color } }),
                    el('span', { className: 'category-row-name' }, category.name),
                    el(
                        'span',
                        { className: 'category-row-count' },
                        category.events === 1 ? '1 evento' : `${category.events ?? 0} eventi`
                    ),
                    el('span', { className: 'category-row-chevron', 'aria-hidden': 'true' }, '›')
                )
            )
        )
    );
}

async function openCategoryManager() {
    toggleMenu(false);
    renderCategoryManager();
    openDialog($('categories-dialog'));
    try {
        state.categories = await api.listCategories();
        renderCategoryManager();
    } catch (error) {
        showError(error);
    }
}

function openCategoryForm(category = null) {
    state.editingCategory = category;
    const form = $('category-form');
    form.reset();
    clearErrors(form);
    $('category-dialog-title').textContent = category ? 'Modifica categoria' : 'Nuova categoria';
    $('category-name').value = category?.name ?? '';
    const color = category?.color ?? suggestedColor();
    const radio = [...form.querySelectorAll('input[name="color"]')].find((r) => r.value === color);
    if (radio) radio.checked = true;
    $('delete-category-btn').hidden = !category;
    openDialog($('category-dialog'));
    $('category-name').focus();
}

async function afterCategoriesChanged() {
    [state.events, state.categories] = await Promise.all([api.listEvents(), api.listCategories()]);
    render();
    renderCategoryManager();
}

async function saveCategory(e) {
    e.preventDefault();
    const form = $('category-form');
    clearErrors(form);
    const data = {
        name: $('category-name').value.trim(),
        color: form.querySelector('input[name="color"]:checked')?.value,
    };
    if (!data.name) return showFieldErrors(form, { name: 'Inserisci un nome' });
    try {
        if (state.editingCategory) await api.updateCategory(state.editingCategory.id, data);
        else await api.createCategory(data);
        $('category-dialog').close();
        showToast(state.editingCategory ? 'Categoria aggiornata' : 'Categoria creata', 'success');
        await afterCategoriesChanged();
    } catch (error) {
        if (error instanceof ApiError && error.status === 409) showFieldErrors(form, { name: error.message });
        else if (error instanceof ApiError && error.details) showFieldErrors(form, error.details);
        else showError(error, 'Impossibile salvare la categoria');
    }
}

async function deleteCategory() {
    const category = state.editingCategory;
    const count = category.events ?? 0;
    const confirmed = await confirmDialog({
        title: `Eliminare “${category.name}”?`,
        message: count
            ? `${count === 1 ? 'L’evento' : `I ${count} eventi`} di questa categoria ${count === 1 ? 'resterà' : 'resteranno'}, senza categoria.`
            : 'La categoria non ha eventi.',
        confirmLabel: 'Elimina',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await api.deleteCategory(category.id);
        $('category-dialog').close();
        showToast('Categoria eliminata', 'success');
        await afterCategoriesChanged();
    } catch (error) {
        showError(error, 'Impossibile eliminare la categoria');
    }
}

function eventById(id) {
    return state.events.find((e) => e.id === id);
}

// ==========================================
// PROMEMORIA
// ==========================================
async function createReminder(e) {
    e.preventDefault();
    const input = $('new-reminder-input');
    const title = input.value.trim();
    if (!title) {
        input.focus();
        return;
    }
    const data = {
        title,
        due_date: $('new-reminder-due').value || null,
        priority: $('new-reminder-priority').value,
    };
    try {
        await api.createReminder(data);
        $('reminder-form').reset();
        input.focus();
        await reloadReminders();
    } catch (error) {
        showError(error, 'Impossibile creare il promemoria');
    }
}

// Aggiornamento "ottimistico": la spunta cambia subito e viene annullata se il server fallisce
async function toggleReminder(reminder, completed) {
    reminder.is_completed = completed;
    renderRemindersArea();
    try {
        await api.updateReminder(reminder.id, { is_completed: completed });
        await reloadReminders();
    } catch (error) {
        reminder.is_completed = !completed;
        renderRemindersArea();
        showError(error, 'Impossibile aggiornare il promemoria');
    }
}

function openReminderForm(reminder) {
    state.editingReminder = reminder;
    const form = $('reminder-edit-form');
    clearErrors(form);
    $('reminder-edit-title').value = reminder.title;
    $('reminder-edit-due').value = reminder.due_date
        ? reminder.due_date.length === 10
            ? `${reminder.due_date}T09:00`
            : reminder.due_date
        : '';
    $('reminder-edit-priority').value = reminder.priority;
    openDialog($('reminder-dialog'));
    $('reminder-edit-title').focus();
}

async function saveReminder(e) {
    e.preventDefault();
    const form = $('reminder-edit-form');
    clearErrors(form);
    const data = {
        title: $('reminder-edit-title').value.trim(),
        due_date: $('reminder-edit-due').value || null,
        priority: $('reminder-edit-priority').value,
    };
    if (!data.title) return showFieldErrors(form, { title: 'Inserisci un titolo' });
    try {
        await api.updateReminder(state.editingReminder.id, data);
        $('reminder-dialog').close();
        await reloadReminders();
    } catch (error) {
        if (error instanceof ApiError && error.details) showFieldErrors(form, error.details);
        else showError(error, 'Impossibile salvare il promemoria');
    }
}

async function deleteReminder(reminder) {
    const confirmed = await confirmDialog({
        title: 'Eliminare il promemoria?',
        message: `“${reminder.title}” verrà eliminato definitivamente.`,
        confirmLabel: 'Elimina',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await api.deleteReminder(reminder.id);
        await reloadReminders();
    } catch (error) {
        showError(error, 'Impossibile eliminare il promemoria');
    }
}

async function clearCompleted() {
    const count = state.reminders.filter((r) => r.is_completed).length;
    const confirmed = await confirmDialog({
        title: 'Eliminare i completati?',
        message: `Verranno eliminati ${count} ${count === 1 ? 'promemoria completato' : 'promemoria completati'}.`,
        confirmLabel: 'Elimina',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await api.deleteCompletedReminders();
        await reloadReminders();
    } catch (error) {
        showError(error);
    }
}

// ==========================================
// IMPORT / EXPORT .ICS
// ==========================================
async function importICS(file) {
    try {
        const { events, warnings } = parseICS(await file.text());
        if (!events.length) {
            showToast('Nessun evento trovato nel file', 'error');
            return;
        }
        const confirmed = await confirmDialog({
            title: 'Importare il calendario?',
            message: `Verranno aggiunti ${events.length} eventi da “${file.name}”.`,
            confirmLabel: 'Importa',
        });
        if (!confirmed) return;
        const result = await api.importEvents(events);
        let message = `Importati ${result.imported} eventi`;
        if (result.skipped) message += ` (${result.skipped} non validi scartati)`;
        showToast(message, 'success', 6000);
        if (warnings.length) {
            console.warn('Avvisi importazione .ics:', warnings);
            showToast(
                `${warnings.length} eventi con ripetizioni non supportate importati come singoli`,
                'info',
                6000
            );
        }
        await reloadEvents();
    } catch (error) {
        showError(error, 'Importazione non riuscita');
    }
}

function exportICS() {
    if (!state.events.length) {
        showToast('Non ci sono eventi da esportare', 'info');
        return;
    }
    downloadFile(`chronoflow-${toDateKey(new Date())}.ics`, buildICS(state.events), 'text/calendar');
}

// ==========================================
// TEMA, NOTIFICHE, MENU, SIDEBAR MOBILE
// ==========================================
function updateThemeButton() {
    const theme = getTheme();
    const button = $('theme-btn');
    button.replaceChildren(icon(theme));
    button.setAttribute('aria-label', `Tema: ${THEME_LABELS[theme]}. Cambia tema`);
    button.title = `Tema: ${THEME_LABELS[theme]}`;
}

function updateNotificationsButton() {
    const button = $('notifications-btn');
    if (!notifications.isSupported()) {
        button.textContent = 'Notifiche non supportate';
        button.disabled = true;
        return;
    }
    button.textContent = notifications.isEnabled() ? 'Disattiva notifiche' : 'Attiva notifiche';
}

async function toggleNotifications() {
    try {
        const mode = await notifications.setEnabled(!notifications.isEnabled());
        if (mode === 'push') {
            showToast(
                'Notifiche attivate: arriveranno anche ad app chiusa. Ti ho inviato una prova.',
                'success',
                6000
            );
        } else if (mode === 'local') {
            showToast('Notifiche attivate (solo mentre l’app è aperta)', 'success', 6000);
            if (notifications.needsIosInstall()) {
                showToast(
                    'Su iPhone, per riceverle ad app chiusa aggiungi l’app alla schermata Home',
                    'info',
                    8000
                );
            }
        } else {
            showToast('Notifiche disattivate', 'success');
        }
    } catch (error) {
        showError(error);
    }
    updateNotificationsButton();
}

function toggleMenu(open) {
    const menu = $('menu-list');
    const show = open ?? menu.hidden;
    menu.hidden = !show;
    $('menu-btn').setAttribute('aria-expanded', String(show));
    if (show) menu.querySelector('button:not([disabled]):not([hidden])')?.focus();
}

function toggleSidebar(open) {
    const sidebar = $('sidebar');
    const show = open ?? !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', show);
    $('sidebar-backdrop').hidden = !show;
    $('reminders-toggle').setAttribute('aria-expanded', String(show));
    if (show) $('new-reminder-input').focus();
    else if (mobileQuery.matches) $('reminders-toggle').focus();
}

// ==========================================
// LOGIN
// ==========================================
function showLogin() {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    $('login-screen').hidden = false;
    $('login-password').value = '';
    $('login-password').focus();
}

async function login(e) {
    e.preventDefault();
    const errorText = $('login-error');
    errorText.textContent = '';
    try {
        await api.login($('login-password').value);
        $('login-screen').hidden = true;
        $('logout-btn').hidden = false;
        notifications.syncPush();
        await loadData();
    } catch (error) {
        errorText.textContent = error.message;
        $('login-password').select();
    }
}

async function logout() {
    toggleMenu(false);
    try {
        await api.logout();
    } finally {
        state.events = [];
        state.reminders = [];
        render();
        showLogin();
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function isTyping(target) {
    return target.closest('input, textarea, select, [contenteditable="true"]');
}

function setupEventListeners() {
    // Navigazione e viste
    $('prev-btn').addEventListener('click', () => navigate(-1));
    $('next-btn').addEventListener('click', () => navigate(1));
    $('today-btn').addEventListener('click', () => navigate(0));
    document.querySelectorAll('.view-switch button').forEach((button) => {
        button.addEventListener('click', () => setView(button.dataset.view));
    });
    $('new-event-btn').addEventListener('click', () => openEventForm({ day: newEventDay() }));

    // Ricerca e filtro
    let searchTimer;
    $('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.search = e.target.value;
            renderCalendarArea();
        }, 150);
    });
    $('search-toggle').addEventListener('click', () => toggleSearch());
    $('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileQuery.matches) toggleSearch(false);
    });
    $('category-filter').addEventListener('change', (e) => {
        state.category = e.target.value;
        renderCalendarArea();
    });

    // Form evento
    $('event-form').addEventListener('submit', saveEvent);
    $('event-all-day').addEventListener('change', (e) => setAllDay(e.target.checked));
    $('event-recurrence').addEventListener('change', updateRecurrenceFields);
    $('event-start').addEventListener('focus', onStartFocus);
    $('event-start').addEventListener('change', onStartChange);

    // Dettagli evento
    $('edit-event-btn').addEventListener('click', () => {
        const event = eventById(state.selectedOccurrence.event.id);
        $('details-dialog').close();
        openEventForm({ event });
    });
    $('duplicate-event-btn').addEventListener('click', () => {
        const { event, startValue, endValue } = state.selectedOccurrence;
        $('details-dialog').close();
        // La copia parte dalla data dell'occorrenza selezionata
        openEventForm({ copyOf: { ...event, start_datetime: startValue, end_datetime: endValue } });
    });
    $('delete-event-btn').addEventListener('click', deleteSelectedEvent);

    // Promemoria
    $('reminder-form').addEventListener('submit', createReminder);
    $('reminder-edit-form').addEventListener('submit', saveReminder);
    $('show-completed').checked = state.showCompleted;
    $('show-completed').addEventListener('change', (e) => {
        state.showCompleted = e.target.checked;
        writePref('cf-show-completed', String(state.showCompleted));
        renderRemindersArea();
    });
    $('clear-completed-btn').addEventListener('click', clearCompleted);

    // Chiusura dei dialog: pulsanti [data-close] e clic sullo sfondo
    document.querySelectorAll('dialog').forEach((dialog) => {
        closeOnBackdrop(dialog);
        dialog
            .querySelectorAll('[data-close]')
            .forEach((b) => b.addEventListener('click', () => dialog.close()));
    });

    // Menu
    $('menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu')) toggleMenu(false);
    });
    $('menu-list').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleMenu(false);
            $('menu-btn').focus();
        }
    });
    $('notifications-btn').addEventListener('click', () => {
        toggleMenu(false);
        toggleNotifications();
    });
    $('categories-btn').addEventListener('click', openCategoryManager);
    $('add-category-btn').addEventListener('click', () => openCategoryForm());
    $('category-form').addEventListener('submit', saveCategory);
    $('delete-category-btn').addEventListener('click', deleteCategory);
    $('category-options').addEventListener('change', onCategoryChoiceChange);
    $('import-btn').addEventListener('click', () => {
        toggleMenu(false);
        $('ics-file').click();
    });
    $('ics-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) importICS(file);
    });
    $('export-btn').addEventListener('click', () => {
        toggleMenu(false);
        exportICS();
    });
    $('logout-btn').addEventListener('click', logout);

    // Tema
    $('theme-btn').addEventListener('click', () => {
        const theme = nextTheme(getTheme());
        setTheme(theme);
        updateThemeButton();
        showToast(`Tema: ${THEME_LABELS[theme]}`);
    });
    window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => applyTheme(getTheme()));

    // Sidebar promemoria su mobile
    $('reminders-toggle').addEventListener('click', () => toggleSidebar());
    $('sidebar-close').addEventListener('click', () => toggleSidebar(false));
    $('sidebar-backdrop').addEventListener('click', () => toggleSidebar(false));
    mobileQuery.addEventListener('change', () => {
        toggleSidebar(false);
        document.querySelector('.app-header').classList.remove('search-open');
        renderCalendarArea();
    });

    // Login
    $('login-form').addEventListener('submit', login);
    onUnauthorized(showLogin);

    // Scorciatoie da tastiera (quando non si sta scrivendo e nessun dialog è aperto)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $('sidebar').classList.contains('open')) return toggleSidebar(false);
        if (
            e.ctrlKey ||
            e.metaKey ||
            e.altKey ||
            isTyping(e.target) ||
            document.querySelector('dialog[open]')
        )
            return;
        if (!$('login-screen').hidden) return;
        const actions = {
            ArrowLeft: () => navigate(-1),
            ArrowRight: () => navigate(1),
            t: () => navigate(0),
            n: () => openEventForm({ day: newEventDay() }),
            m: () => setView('month'),
            s: () => setView('week'),
            g: () => setView('day'),
            '/': () => (mobileQuery.matches ? toggleSearch(true) : $('search-input').focus()),
        };
        const action = actions[e.key];
        if (action) {
            e.preventDefault();
            action();
        }
    });

    // Swipe orizzontale sul calendario per cambiare periodo (smartphone)
    let touchStart = null;
    $('calendar').addEventListener(
        'touchstart',
        (e) => {
            touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        },
        { passive: true }
    );
    $('calendar').addEventListener(
        'touchend',
        (e) => {
            if (!touchStart || state.search) return;
            const dx = e.changedTouches[0].clientX - touchStart.x;
            const dy = e.changedTouches[0].clientY - touchStart.y;
            touchStart = null;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 50) navigate(dx < 0 ? 1 : -1);
        },
        { passive: true }
    );

    // Stato della connessione
    const updateOnline = () => ($('offline-banner').hidden = navigator.onLine);
    window.addEventListener('online', () => {
        updateOnline();
        loadData({ silent: true });
    });
    window.addEventListener('offline', updateOnline);
    updateOnline();

    // Tornando sull'app dopo un po', ricarichiamo i dati (potrebbero essere cambiati da un altro dispositivo)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - state.loadedAt > 60000) {
            loadData({ silent: true });
        }
    });

    // A mezzanotte "oggi" cambia: ridisegniamo ogni minuto se è cambiato il giorno
    let lastDay = toDateKey(new Date());
    setInterval(() => {
        const today = toDateKey(new Date());
        if (today !== lastDay) {
            lastDay = today;
            render();
        }
    }, 60000);
}

// ==========================================
// AVVIO
// ==========================================
// iPhone: la tastiera copre la pagina senza ridimensionarla. Teniamo aggiornate le misure dell'area
// davvero visibile (visualViewport) così i form possono restare tutti sopra la tastiera (vedi style.css).
function trackKeyboard() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
        root.style.setProperty('--vv-height', `${viewport.height}px`);
        root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
        const typing = document.activeElement?.matches?.(
            'input:not([type="checkbox"]):not([type="radio"]), textarea, select'
        );
        // clientHeight è l'altezza della pagina, che su iPhone non cambia quando compare la tastiera
        const open = Boolean(typing) && root.clientHeight - viewport.height > 120;
        const wasOpen = root.classList.contains('keyboard-open');
        root.classList.toggle('keyboard-open', open);
        // Appena il foglio si adatta, riportiamo in vista il campo su cui si sta scrivendo
        if (open && !wasOpen) {
            requestAnimationFrame(() => document.activeElement?.scrollIntoView({ block: 'nearest' }));
        }
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', () => setTimeout(update, 60));
    document.addEventListener('focusout', () => setTimeout(update, 60));
    update();
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        await navigator.serviceWorker.register('sw.js');
    } catch (error) {
        console.warn('Service worker non registrato:', error);
    }
}

async function init() {
    applyTheme(getTheme());
    updateThemeButton();
    setupCategoryColors();
    trackKeyboard();
    setupEventListeners();
    updateNotificationsButton();
    registerServiceWorker();
    notifications.startNotifications(() => ({ events: state.events, reminders: state.reminders }));

    try {
        const status = await api.authStatus();
        $('logout-btn').hidden = !status.authRequired;
        if (status.authRequired && !status.authenticated) {
            renderCalendarArea();
            showLogin();
            return;
        }
        notifications.syncPush();
    } catch (error) {
        // Offline: proseguiamo, il service worker può fornire gli ultimi dati salvati
        if (navigator.onLine) showError(error, 'Impossibile contattare il server');
    }
    await loadData();
}

init();
