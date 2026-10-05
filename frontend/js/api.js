// Client per le API del backend: gestisce errori di rete, errori di validazione e sessione scaduta.

export class ApiError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details || null;
    }
}

let unauthorizedHandler = null;

// Funzione chiamata quando il server risponde 401 (sessione scaduta o assente)
export function onUnauthorized(handler) {
    unauthorizedHandler = handler;
}

async function request(method, path, body) {
    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, navigator.onLine ? 'Impossibile contattare il server' : 'Sei offline');
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/auth/') && unauthorizedHandler)
            unauthorizedHandler();
        throw new ApiError(response.status, data?.error || `Errore ${response.status}`, data?.details);
    }
    return data;
}

export const api = {
    authStatus: () => request('GET', '/auth/status'),
    login: (password) => request('POST', '/auth/login', { password }),
    logout: () => request('POST', '/auth/logout'),

    listEvents: () => request('GET', '/events'),
    createEvent: (event) => request('POST', '/events', event),
    updateEvent: (id, event) => request('PUT', `/events/${id}`, event),
    deleteEvent: (id) => request('DELETE', `/events/${id}`),
    importEvents: (events) => request('POST', '/events/import', { events }),

    listReminders: () => request('GET', '/reminders'),
    createReminder: (reminder) => request('POST', '/reminders', reminder),
    updateReminder: (id, changes) => request('PATCH', `/reminders/${id}`, changes),
    deleteReminder: (id) => request('DELETE', `/reminders/${id}`),
    deleteCompletedReminders: () => request('DELETE', '/reminders/completed'),

    listCategories: () => request('GET', '/categories'),
    createCategory: (category) => request('POST', '/categories', category),
    updateCategory: (id, changes) => request('PATCH', `/categories/${id}`, changes),
    deleteCategory: (id) => request('DELETE', `/categories/${id}`),

    pushConfig: () => request('GET', '/push/config'),
    pushSubscribe: (subscription) => request('POST', '/push/subscribe', { subscription }),
    pushUnsubscribe: (endpoint) => request('POST', '/push/unsubscribe', { endpoint }),
    pushTest: () => request('POST', '/push/test'),
};
