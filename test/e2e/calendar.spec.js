import { test, expect } from '@playwright/test';

// Data fissa per rendere i test indipendenti dal giorno in cui vengono eseguiti
test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-05T10:00:00'));
    page.on('dialog', (dialog) => {
        throw new Error(`Dialog nativo inatteso: ${dialog.message()}`);
    });
    await page.goto('/');
    await expect(page.locator('#period-label')).toHaveText('Ottobre 2026');
});

test('crea, modifica ed elimina un evento', async ({ page }) => {
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    const dialog = page.locator('#event-dialog');
    await dialog.getByLabel('Titolo').fill('Riunione E2E');
    await dialog.getByLabel('Inizio').fill('2026-10-07T14:00');
    await dialog.getByLabel('Fine').fill('2026-10-07T15:00');
    await dialog.getByLabel('Categoria').fill('Lavoro');
    await dialog.getByRole('button', { name: 'Salva' }).click();
    await expect(dialog).not.toBeVisible();

    const chip = page.locator('[data-date="2026-10-07"] .event-chip', { hasText: 'Riunione E2E' });
    await expect(chip).toContainText('14:00');

    await chip.click();
    const details = page.locator('#details-dialog');
    await expect(details).toContainText('Lavoro');
    await details.getByRole('button', { name: 'Modifica' }).click();
    await dialog.getByLabel('Titolo').fill('Riunione spostata');
    await dialog.getByLabel('Ripetizione').selectOption('weekly');
    await dialog.getByRole('button', { name: 'Salva' }).click();

    // La serie settimanale compare anche nelle settimane successive
    await expect(
        page.locator('[data-date="2026-10-14"] .event-chip', { hasText: 'Riunione spostata' })
    ).toBeVisible();

    await page.locator('[data-date="2026-10-14"] .event-chip', { hasText: 'Riunione spostata' }).click();
    await details.getByRole('button', { name: 'Elimina' }).click();
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page.locator('#calendar').getByText('Riunione spostata')).toHaveCount(0);
});

test('validazione del form: la fine non può precedere l’inizio', async ({ page }) => {
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    const dialog = page.locator('#event-dialog');
    await dialog.getByLabel('Titolo').fill('Sbagliato');
    await dialog.getByLabel('Inizio').fill('2026-10-07T14:00');
    await dialog.getByLabel('Fine').fill('2026-10-07T13:00');
    await dialog.getByRole('button', { name: 'Salva' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-error-for="end_datetime"]')).toHaveText(
        'La fine non può precedere l’inizio'
    );
});

test('clic su un giorno apre un nuovo evento in quella data', async ({ page }) => {
    await page.locator('[data-date="2026-10-20"]').click();
    await expect(page.locator('#event-start')).toHaveValue('2026-10-20T09:00');
    await expect(page.locator('#event-end')).toHaveValue('2026-10-20T10:00');
    await page.keyboard.press('Escape');
    await expect(page.locator('#event-dialog')).not.toBeVisible();
});

test('evento di tutto il giorno su più giorni', async ({ page }) => {
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    const dialog = page.locator('#event-dialog');
    await dialog.getByLabel('Titolo').fill('Ferie');
    await dialog.getByLabel('Tutto il giorno').check();
    await dialog.getByLabel('Inizio').fill('2026-10-26');
    await dialog.getByLabel('Fine').fill('2026-10-28');
    await dialog.getByRole('button', { name: 'Salva' }).click();
    for (const day of ['26', '27', '28']) {
        await expect(
            page.locator(`[data-date="2026-10-${day}"] .event-chip`, { hasText: 'Ferie' })
        ).toBeVisible();
    }
});

test('promemoria: aggiunta, completamento persistente, eliminazione', async ({ page }) => {
    await page.getByLabel('Nuovo promemoria').fill('Comprare il pane');
    await page.getByLabel('Nuovo promemoria').press('Enter');
    const item = page.locator('.reminder-item', { hasText: 'Comprare il pane' });
    await expect(item).toBeVisible();

    await item.getByRole('checkbox').check();
    await expect(item).toHaveClass(/completed/);
    await page.reload();
    await expect(
        page.locator('.reminder-item', { hasText: 'Comprare il pane' }).getByRole('checkbox')
    ).toBeChecked();

    await page.getByRole('button', { name: 'Elimina “Comprare il pane”' }).click();
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Elimina' }).click();
    await expect(page.locator('.reminder-item', { hasText: 'Comprare il pane' })).toHaveCount(0);
});

test('un titolo con HTML viene mostrato come testo (niente XSS)', async ({ page }) => {
    const payload = '<img src=x onerror="document.body.dataset.xss=1">';
    await page.getByLabel('Nuovo promemoria').fill(payload);
    await page.getByRole('button', { name: 'Aggiungi promemoria' }).click();
    await expect(page.locator('.reminder-title', { hasText: payload })).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-xss', '1');
});

test('viste, navigazione e ricerca', async ({ page }) => {
    await page.getByRole('button', { name: 'Periodo successivo' }).click();
    await expect(page.locator('#period-label')).toHaveText('Novembre 2026');
    await page.getByRole('button', { name: 'Oggi' }).click();
    await expect(page.locator('#period-label')).toHaveText('Ottobre 2026');

    await page.getByRole('button', { name: 'Settimana' }).click();
    await expect(page.locator('#period-label')).toHaveText('5 – 11 ottobre 2026');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#period-label')).toHaveText('12 – 18 ottobre 2026');
    await page.getByRole('button', { name: 'Giorno' }).click();
    await expect(page.locator('#period-label')).toContainText('ottobre 2026');
    await page.getByRole('button', { name: 'Mese' }).click();

    await page.getByLabel('Cerca eventi').fill('Ferie');
    await expect(page.locator('.search-summary')).toContainText('per “Ferie”');
});

test('tema chiaro/scuro', async ({ page }) => {
    const theme = page.locator('#theme-btn');
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('export e import .ics', async ({ page }) => {
    await page.getByRole('button', { name: 'Altre opzioni' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Esporta calendario (.ics)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('chronoflow-2026-10-05.ics');

    const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20261023T090000',
        'DTEND:20261023T100000',
        'SUMMARY:Importato da ICS',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
    await page
        .locator('#ics-file')
        .setInputFiles({ name: 'test.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Importa' }).click();
    await expect(
        page.locator('[data-date="2026-10-23"] .event-chip', { hasText: 'Importato da ICS' })
    ).toBeVisible();
});

test('PWA: dopo il primo caricamento l’app funziona anche offline', async ({ page, context }) => {
    await page.getByLabel('Nuovo promemoria').fill('Visibile offline');
    await page.getByLabel('Nuovo promemoria').press('Enter');
    await expect(page.locator('.reminder-item', { hasText: 'Visibile offline' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // ora la pagina è controllata dal service worker, che salva i dati
    await expect(page.locator('.reminder-item', { hasText: 'Visibile offline' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#offline-banner')).toBeVisible();
    await expect(page.locator('.reminder-item', { hasText: 'Visibile offline' })).toBeVisible();
    await expect(page.locator('.day-cell').first()).toBeVisible();
    await context.setOffline(false);
});

test('attivazione delle notifiche', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.getByRole('button', { name: 'Altre opzioni' }).click();
    await page.getByRole('button', { name: 'Attiva notifiche' }).click();
    await expect(page.locator('.toast', { hasText: 'Notifiche attivate' })).toBeVisible();
});
