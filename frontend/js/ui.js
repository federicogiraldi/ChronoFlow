// Piccoli componenti di interfaccia riutilizzabili: creazione elementi, toast, conferme.

// Crea un elemento DOM. I testi vengono sempre inseriti con textContent (mai innerHTML),
// così i dati dell'utente non possono iniettare codice HTML.
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

// ---------- Toast (notifiche temporanee in basso) ----------
export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toasts');
    const toast = el(
        'div',
        { className: `toast toast-${type}`, role: type === 'error' ? 'alert' : null },
        message
    );
    container.append(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function showError(error, fallback = 'Si è verificato un errore') {
    console.error(error);
    showToast(error?.message || fallback, 'error', 6000);
}

// ---------- Finestra di conferma (sostituisce confirm()) ----------
export function confirmDialog({ title, message, confirmLabel = 'Conferma', danger = false }) {
    const dialog = document.getElementById('confirm-dialog');
    dialog.querySelector('#confirm-title').textContent = title;
    dialog.querySelector('#confirm-message').textContent = message;
    const okButton = dialog.querySelector('#confirm-ok');
    okButton.textContent = confirmLabel;
    okButton.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    return new Promise((resolve) => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
        openDialog(dialog);
        dialog.querySelector('#confirm-cancel').focus();
    });
}

// Apre un <dialog> modale. Il <dialog> nativo gestisce focus, tasto Esc e accessibilità.
export function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
}

// Chiude il dialog quando si clicca sullo sfondo scuro (fuori dal contenuto)
export function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });
}

// Colore del testo (bianco o scuro) leggibile sopra un colore di sfondo
export function readableTextColor(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const [r, g, b] = m.slice(1).map((h) => {
        const c = parseInt(h, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.4 ? '#111111' : '#ffffff';
}

// Scarica un testo come file
export function downloadFile(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = el('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Icone SVG (stringhe costanti, nessun dato dell'utente)
const ICONS = {
    system: '<path d="M12 3a9 9 0 1 0 0 18z" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
    light: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    dark: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill="currentColor"/>',
};

export function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
}
