// ==========================================
// 1. STATO DELL'APPLICAZIONE
// ==========================================
let currentDate = new Date(); // La data attuale che stiamo visualizzando
let reminders = [];           // Array che conterrà i promemoria dal backend
let events = [];              // Array che conterrà gli eventi (lo useremo dopo)
let selectedEventId = null; // Traccia l'ID dell'evento aperto nella modale dettagli

// ==========================================
// 2. INIZIALIZZAZIONE
// ==========================================
// Aspettiamo che l'HTML sia completamente caricato prima di agire
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Funzione master che fa partire tutto
async function initApp() {
    setupEventListeners();
    await fetchReminders();
    await fetchEvents();    // <- NUOVA RIGA: Scarichiamo gli eventi
    renderReminders();
    renderCalendar();       // Disegnando il calendario ORA, avrà gli eventi a disposizione
}

// ==========================================
// 3. LOGICA PROMEMORIA
// ==========================================
async function fetchReminders() {
    try {
        const response = await fetch('/api/reminders');
        reminders = await response.json();
    } catch (error) {
        console.error("Errore nel caricamento dei promemoria:", error);
    }
}

function renderReminders() {
    const list = document.getElementById('reminders-list');
    list.innerHTML = ''; // Puliamo il placeholder HTML ("Nessun promemoria...")

    if (reminders.length === 0) {
        list.innerHTML = '<p>Nessun promemoria attivo.</p>';
        return;
    }

    // Per ogni promemoria nel database, creiamo un elemento HTML
    reminders.forEach(reminder => {
        const div = document.createElement('div');
        div.className = 'reminder-item';
        
        div.innerHTML = `
            <div class="reminder-content">
                <input type="checkbox" ${reminder.is_completed ? 'checked' : ''}>
                <span>${reminder.title}</span>
            </div>
            <button class="delete-btn" title="Elimina">&times;</button>
        `;

        // Catturiamo il pulsante di eliminazione che abbiamo appena creato
        const deleteBtn = div.querySelector('.delete-btn');
        // Gli assegniamo un "cacciatore di eventi" che passa l'ID corretto
        deleteBtn.addEventListener('click', () => deleteReminder(reminder.id));

        list.appendChild(div);
    });
}

// ==========================================
// 4. LOGICA CALENDARIO
// ==========================================
// Scarica gli eventi dal database
async function fetchEvents() {
    try {
        const response = await fetch('/api/events');
        events = await response.json();
    } catch (error) {
        console.error("Errore nel caricamento degli eventi:", error);
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = ''; // Rimuoviamo "Caricamento calendario..."

    // Aggiorniamo l'etichetta del mese e anno in italiano
    const monthLabel = document.getElementById('current-month-label');
    const monthName = currentDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    monthLabel.innerText = monthName;

    // Estraiamo anno e mese correnti
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // CALCOLI PER LE DATE:
    // Troviamo che giorno della settimana è il 1° del mese (0 = Domenica, 1 = Lunedì, ecc.)
    let firstDayIndex = new Date(year, month, 1).getDay();
    // Adattamento per iniziare la settimana di Lunedì (standard europeo)
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 
    
    // Quanti giorni ha questo mese? (Il giorno 0 del mese successivo è l'ultimo del mese corrente)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 1. Creiamo le celle vuote per i giorni prima dell'inizio del mese
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    // 2. Creiamo le celle per i giorni effettivi
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        dayCell.innerHTML = `<strong>${i}</strong>`;
        
        // Formattiamo la data del quadratino in 'YYYY-MM-DD' per poterla confrontare.
        const cellDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

        // === NUOVA LOGICA EVENTI MULTI-GIORNO ===
        // Filtriamo gli eventi che "attraversano" o "toccano" questo giorno
        const dayEvents = events.filter(event => {
            // Estraiamo solo la data (YYYY-MM-DD) tagliando via l'orario (T...)
            const startDate = event.start_datetime.split('T')[0];
            const endDate = event.end_datetime.split('T')[0];
            
            // L'evento occupa questo giorno se la data della cella è >= all'inizio E <= alla fine
            return cellDateString >= startDate && cellDateString <= endDate;
        });

        // Per ogni evento trovato, creiamo il mattoncino
        dayEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'calendar-event';
            
            const startDate = event.start_datetime.split('T')[0];
            
            // UX MIGLIORATA: Mostriamo sempre il titolo.
            // Se non è il primo giorno dell'evento, aggiungiamo un indicatore di "continuazione"
            if (cellDateString === startDate) {
                eventEl.innerText = event.title;
            } else {
                eventEl.innerText = `« ${event.title}`; 
            }
            
            eventEl.style.backgroundColor = event.color; 
            
            // Apriamo la modale dei dettagli al click
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita interferenze con la cella
                showEventDetails(event);
            });
            
            dayCell.appendChild(eventEl);
        });

        grid.appendChild(dayCell);
    }
}

// Popola e mostra la modale dei dettagli dell'evento
function showEventDetails(event) {
    const detailsModal = document.getElementById('event-details-modal');
    selectedEventId = event.id; // Salviamo l'ID dell'evento aperto

    document.getElementById('details-event-title').innerText = event.title;
    
    // Convertiamo le stringhe ISO in oggetti Date e le formattiamo in italiano (GG/MM/AAAA, HH:MM)
    const startDate = new Date(event.start_datetime);
    const endDate = new Date(event.end_datetime);

    const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    document.getElementById('details-event-start').innerText = startDate.toLocaleString('it-IT', dateOptions);
    document.getElementById('details-event-end').innerText = endDate.toLocaleString('it-IT', dateOptions);

    // Mostriamo la modale rimuovendo 'hidden'
    detailsModal.classList.remove('hidden');
}

// ==========================================
// 5. EVENT LISTENERS E INTERAZIONI
// ==========================================
function setupEventListeners() {
    const addReminderBtn = document.getElementById('add-reminder-btn');
    const reminderInput = document.getElementById('new-reminder-input');

    // Ascoltiamo il click sul pulsante "+"
    addReminderBtn.addEventListener('click', async () => {
        const title = reminderInput.value.trim(); // .trim() rimuove gli spazi vuoti inutili
        
        // Se il campo è vuoto, non facciamo nulla
        if (!title) return;

        // Chiamiamo la funzione per salvare nel database
        await createReminder(title);
        
        // Svuotiamo il campo di testo per un nuovo inserimento
        reminderInput.value = '';
    });

    // Bonus: Permettiamo di inviare il promemoria anche premendo "Invio" sulla tastiera
    reminderInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addReminderBtn.click();
        }
    });

    // --- LOGICA MODALE EVENTI ---
    const modal = document.getElementById('event-modal');
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveEventBtn = document.getElementById('save-event-btn');

    // Apre la modale rimuovendo la classe 'hidden'
    openModalBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    // Chiude la modale cliccando sulla X
    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Chiude la modale se l'utente clicca fuori dalla finestra
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // Ascoltiamo il click per salvare l'evento
    saveEventBtn.addEventListener('click', async () => {
        // Estraiamo i valori inseriti dall'utente
        const title = document.getElementById('event-title').value;
        const start = document.getElementById('event-start').value;
        const end = document.getElementById('event-end').value;

        // Validazione base: controlliamo che i campi non siano vuoti
        if (!title || !start || !end) {
            alert("Per favore, compila tutti i campi!");
            return;
        }

        // Chiamiamo la funzione per inviare i dati al database
        await createEvent(title, start, end);
        
        // Pulizia: svuotiamo i campi e chiudiamo la modale
        document.getElementById('event-title').value = '';
        document.getElementById('event-start').value = '';
        document.getElementById('event-end').value = '';
        modal.classList.add('hidden');
    });

    // --- LOGICA MODALE DETTAGLI EVENTO ---
    const detailsModal = document.getElementById('event-details-modal');
    const closeDetailsModalBtn = document.getElementById('close-details-modal-btn');
    const deleteEventBtn = document.getElementById('delete-event-btn');

    // Chiude la modale con la X
    closeDetailsModalBtn.addEventListener('click', () => {
        detailsModal.classList.add('hidden');
    });

    // Chiude la modale cliccando sullo sfondo scuro
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.classList.add('hidden');
        }
    });

    // Cliccando su "Elimina Evento" dentro la modale
    deleteEventBtn.addEventListener('click', async () => {
        if (selectedEventId) {
            await deleteEvent(selectedEventId);
            detailsModal.classList.add('hidden');
            selectedEventId = null;
        }
    });

    // --- LOGICA NAVIGAZIONE MESE ---
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');

    prevBtn.addEventListener('click', () => {
        // Sottraiamo 1 al mese corrente
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        // Aggiungiamo 1 al mese corrente
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
}

// Funzione per inviare un nuovo promemoria al backend
async function createReminder(title) {
    try {
        const response = await fetch('/api/reminders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                priority: 'medium'
            })
        });

        if (response.ok) {
            // Se il server ha salvato correttamente, riscarichiamo la lista e la ridisegniamo
            await fetchReminders();
            renderReminders();
        }
    } catch (error) {
        console.error("Errore durante la creazione del promemoria:", error);
    }
}

// Funzione per inviare un nuovo evento al backend
async function createEvent(title, startDatetime, endDatetime) {
    try {
        const response = await fetch('/api/events', {
            method: 'POST', // Specifichiamo che stiamo SCRIVENDO dati
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                start_datetime: startDatetime,
                end_datetime: endDatetime,
                color: "#3788d8", // Colore di default
                category: "Generale"
            })
        });

        if (response.ok) {
            console.log("✅ Evento salvato con successo nel database!");
            
            // RISCARICHIAMO I DATI E RIDISEGNIAMO LA GRIGLIA!
            await fetchEvents();
            renderCalendar();
            
        } else {
            console.error("❌ Errore nel salvataggio dell'evento:", response.statusText);
        }
    } catch (error) {
        console.error("Errore di rete durante la creazione dell'evento:", error);
    }
}

// ==========================================
// 6. LOGICA DI ELIMINAZIONE (DELETE)
// ==========================================

// Elimina un Promemoria
async function deleteReminder(id) {
    // Chiediamo conferma all'utente con un pop-up nativo del browser
    if (!confirm("Sei sicuro di voler eliminare questo promemoria?")) return;

    try {
        const response = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
        if (response.ok) {
            // Se eliminato con successo, riscarichiamo i dati e ridisegniamo la lista
            await fetchReminders();
            renderReminders();
        }
    } catch (error) {
        console.error("Errore durante l'eliminazione del promemoria:", error);
    }
}

// Elimina un Evento
async function deleteEvent(id) {
    try {
        const response = await fetch(`/api/events/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await fetchEvents();
            renderCalendar();
        }
    } catch (error) {
        console.error("Errore durante l'eliminazione dell'evento:", error);
    }
}