// Importiamo le librerie necessarie
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importiamo l'inizializzazione del database
const { initDB } = require('./db');

// Importiamo le rotte API che abbiamo appena creato
const apiRoutes = require('./routes/api');

// Inizializziamo l'applicazione Express
const app = express();

// CONFIGURAZIONE PORTA E HOST
// Usiamo la porta 3000 (o quella definita nell'ambiente)
const PORT = process.env.PORT || 3000;
// '0.0.0.0' permette al server di rispondere anche ai dispositivi nella tua rete locale (es. iPhone)
const HOST = '0.0.0.0';

// MIDDLEWARE FONDAMENTALI
// 1. Permette richieste da origini diverse (Cross-Origin Resource Sharing)
app.use(cors());
// 2. Permette ad Express di comprendere i dati inviati in formato JSON nelle richieste POST/PUT
app.use(express.json());

// SERVEREI FILE STATICI DEL FRONTEND
// Diciamo ad Express che la cartella 'frontend' contiene file statici (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../frontend')));

// REGISTRAZIONE ROTTE API
// Diciamo ad Express che tutte le rotte definite in apiRoutes inizieranno con "/api"
app.use('/api', apiRoutes);

// ROTTA TEST API
// Una semplice rotta per verificare che il server risponda correttamente
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'ChronoFlow Server è attivo e funzionante!',
        timestamp: new Date()
    });
});

// Inizializziamo il database prima di avviare il server
initDB();

// AVVIO DEL SERVER
app.listen(PORT, HOST, () => {
    console.log(`==================================================`);
    console.log(`🚀 Server ChronoFlow avviato con successo!`);
    console.log(`💻 Accesso Locale (PC):     http://localhost:${PORT}`);
    console.log(`📱 Accesso da Rete Locale: http://<INDIRIZZO-IP-DEL-TUO-PC>:${PORT}`);
    console.log(`==================================================`);
});