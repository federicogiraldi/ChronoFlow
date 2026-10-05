// Caricato nel <head> prima del CSS: applica subito il tema salvato ed evita il "lampo" di colore.
// (È un file separato perché la Content Security Policy non permette script inline.)
try {
    const theme = localStorage.getItem('cf-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
} catch {
    // localStorage non disponibile: si usa il tema di sistema
}
