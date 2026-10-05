// Tema chiaro/scuro: "system" segue l'impostazione del dispositivo.
const STORAGE_KEY = 'cf-theme';
export const THEMES = ['system', 'light', 'dark'];
export const THEME_LABELS = { system: 'Automatico', light: 'Chiaro', dark: 'Scuro' };

export function getTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return THEMES.includes(saved) ? saved : 'system';
    } catch {
        return 'system';
    }
}

export function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    const dark =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1115' : '#f6f7fb');
}

export function setTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // storage non disponibile (es. navigazione privata): il tema vale solo per questa sessione
    }
    applyTheme(theme);
}

export function nextTheme(theme) {
    return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}
