import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'test/e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile|auth/ },
        { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
        {
            name: 'auth',
            use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
            testMatch: /auth/,
        },
    ],
    webServer: [
        {
            command: 'node scripts/e2e-server.js 4173',
            url: 'http://127.0.0.1:4173/api/health',
            reuseExistingServer: false,
        },
        {
            command: 'node scripts/e2e-server.js 4174 test-password',
            url: 'http://127.0.0.1:4174/api/health',
            reuseExistingServer: false,
        },
    ],
});
