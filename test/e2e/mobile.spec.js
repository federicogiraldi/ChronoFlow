import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-05T10:00:00'));
    await page.goto('/');
});

test('layout mobile: nessuno scroll orizzontale e pannello promemoria', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await expect(page.locator('#sidebar')).not.toBeInViewport();
    await page.getByRole('button', { name: /^Promemoria/ }).click();
    await expect(page.locator('#sidebar')).toBeInViewport();
    await page.getByLabel('Nuovo promemoria').fill('Dal telefono');
    await page.getByLabel('Nuovo promemoria').press('Enter');
    await expect(page.locator('.reminder-item', { hasText: 'Dal telefono' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi promemoria' }).click();
    await expect(page.locator('#sidebar')).not.toBeInViewport();
});

test('creazione evento da mobile', async ({ page }) => {
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    const dialog = page.locator('#event-dialog');
    await dialog.getByLabel('Titolo').fill('Evento mobile');
    await dialog.getByRole('button', { name: 'Salva' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.agenda .event-card', { hasText: 'Evento mobile' })).toBeVisible();
});

test('mese su mobile: toccando un giorno se ne vedono gli eventi', async ({ page }) => {
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    const dialog = page.locator('#event-dialog');
    await dialog.getByLabel('Titolo').fill('Dal dentista');
    await dialog.getByLabel('Inizio').fill('2026-10-14T09:00');
    await dialog.getByLabel('Fine').fill('2026-10-14T10:00');
    await dialog.getByRole('button', { name: 'Salva' }).click();
    await expect(dialog).not.toBeVisible();

    await page.locator('[data-date="2026-10-13"] .day-select').click();
    await expect(page.locator('#agenda-title')).toHaveText('Martedì 13 ottobre');
    await expect(page.locator('.agenda')).not.toContainText('Dal dentista');

    await page.locator('[data-date="2026-10-14"] .day-select').click();
    await expect(page.locator('#agenda-title')).toHaveText('Mercoledì 14 ottobre');
    await expect(page.locator('.agenda .event-card', { hasText: 'Dal dentista' })).toBeVisible();

    // Il "+" propone il giorno selezionato
    await page.getByRole('button', { name: '+ Nuovo evento' }).click();
    await expect(page.locator('#event-start')).toHaveValue('2026-10-14T09:00');
});

test('ricerca su mobile dietro la lente', async ({ page }) => {
    await expect(page.getByLabel('Cerca eventi')).toBeHidden();
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    await page.getByLabel('Cerca eventi').fill('qualcosa');
    await expect(page.locator('.search-summary')).toContainText('per “qualcosa”');
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    await expect(page.getByLabel('Cerca eventi')).toBeHidden();
    await expect(page.locator('#period-label')).toHaveText('Ottobre 2026');
});
