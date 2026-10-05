import { test, expect } from '@playwright/test';

test('login con password, poi logout', async ({ page }) => {
    await page.goto('/');
    const login = page.locator('#login-screen');
    await expect(login).toBeVisible();

    await page.getByLabel('Password').fill('sbagliata');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page.locator('#login-error')).toHaveText('Password errata');

    await page.getByLabel('Password').fill('test-password');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(login).toBeHidden();
    await expect(page.locator('.day-cell').first()).toBeVisible();

    await page.reload();
    await expect(login).toBeHidden();

    await page.getByRole('button', { name: 'Altre opzioni' }).click();
    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(login).toBeVisible();
});
