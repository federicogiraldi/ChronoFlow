const express = require('express');
// Express Router ci permette di organizzare le rotte in file separati
const router = express.Router();
// Importiamo la nostra connessione al database
const { db } = require('../db');

// ==========================================
// ROTTE PER GLI EVENTI (CALENDARIO)
// ==========================================

// 1. GET /api/events - Recupera tutti gli eventi salvati
router.get('/events', (req, res) => {
    try {
        // Prepariamo la query SQL. 'SELECT *' significa "seleziona tutte le colonne"
        const stmt = db.prepare('SELECT * FROM events');
        // Eseguiamo la query. .all() restituisce i risultati come un array di oggetti
        const events = stmt.all();
        
        // Rispondiamo al frontend inviando l'array in formato JSON
        res.json(events);
    } catch (error) {
        console.error('Errore durante il recupero degli eventi:', error);
        // Se qualcosa va storto, restituiamo un errore HTTP 500 (Internal Server Error)
        res.status(500).json({ error: 'Impossibile recuperare gli eventi' });
    }
});

// 2. POST /api/events - Crea un nuovo evento
router.post('/events', (req, res) => {
    try {
        // Estraiamo i dati che il frontend ci ha inviato nel "corpo" (body) della richiesta
        const { title, description, start_datetime, end_datetime, color, category } = req.body;

        // Prepariamo la query SQL di inserimento. 
        // Usiamo i "?" (placeholder) per proteggerci dagli attacchi di SQL Injection!
        const stmt = db.prepare(`
            INSERT INTO events (title, description, start_datetime, end_datetime, color, category)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        // Eseguiamo la query sostituendo i "?" con i dati reali
        const info = stmt.run(title, description, start_datetime, end_datetime, color, category);

        // Rispondiamo con un codice 201 (Created) e l'ID che SQLite ha generato per l'evento
        res.status(201).json({ 
            id: info.lastInsertRowid, 
            message: 'Evento creato con successo!' 
        });
    } catch (error) {
        console.error('Errore durante la creazione dell\'evento:', error);
        res.status(500).json({ error: 'Impossibile creare l\'evento' });
    }
});

// ==========================================
// ROTTE PER I PROMEMORIA (REMINDERS)
// ==========================================

// 3. GET /api/reminders - Recupera tutti i promemoria
router.get('/reminders', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM reminders');
        const reminders = stmt.all();
        res.json(reminders);
    } catch (error) {
        console.error('Errore durante il recupero dei promemoria:', error);
        res.status(500).json({ error: 'Impossibile recuperare i promemoria' });
    }
});

// 4. POST /api/reminders - Crea un nuovo promemoria
router.post('/reminders', (req, res) => {
    try {
        const { title, due_date, priority } = req.body;

        const stmt = db.prepare(`
            INSERT INTO reminders (title, due_date, priority)
            VALUES (?, ?, ?)
        `);
        
        const info = stmt.run(title, due_date, priority || 'medium');

        res.status(201).json({ 
            id: info.lastInsertRowid, 
            message: 'Promemoria creato con successo!' 
        });
    } catch (error) {
        console.error('Errore durante la creazione del promemoria:', error);
        res.status(500).json({ error: 'Impossibile creare il promemoria' });
    }
});

// ==========================================
// ROTTE DI ELIMINAZIONE (DELETE)
// ==========================================

// 5. DELETE /api/events/:id - Elimina un evento specifico
// I due punti (:id) dicono a Express che quel pezzo di URL è un parametro dinamico
router.delete('/events/:id', (req, res) => {
    try {
        // Estraiamo l'ID dall'URL della richiesta
        const eventId = req.params.id;
        
        // Prepariamo ed eseguiamo la query di eliminazione
        const stmt = db.prepare('DELETE FROM events WHERE id = ?');
        const info = stmt.run(eventId);

        // info.changes ci dice quante righe sono state modificate nel database
        if (info.changes > 0) {
            res.json({ message: 'Evento eliminato con successo' });
        } else {
            // Se changes è 0, significa che l'ID non esisteva
            res.status(404).json({ error: 'Evento non trovato' });
        }
    } catch (error) {
        console.error('Errore durante l\'eliminazione dell\'evento:', error);
        res.status(500).json({ error: 'Impossibile eliminare l\'evento' });
    }
});

// 6. DELETE /api/reminders/:id - Elimina un promemoria specifico
router.delete('/reminders/:id', (req, res) => {
    try {
        const reminderId = req.params.id;
        
        const stmt = db.prepare('DELETE FROM reminders WHERE id = ?');
        const info = stmt.run(reminderId);

        if (info.changes > 0) {
            res.json({ message: 'Promemoria eliminato con successo' });
        } else {
            res.status(404).json({ error: 'Promemoria non trovato' });
        }
    } catch (error) {
        console.error('Errore durante l\'eliminazione del promemoria:', error);
        res.status(500).json({ error: 'Impossibile eliminare il promemoria' });
    }
});

// Esportiamo il router per poterlo agganciare al server principale
module.exports = router;