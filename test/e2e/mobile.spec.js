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
    await expect(page.locator('.event-chip', { hasText: 'Evento mobile' })).toBeVisible();
});
