import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'test-results/', 'playwright-report/', '.vercel/'] },
    js.configs.recommended,
    {
        files: ['backend/**/*.js', 'api/**/*.js', 'test/**/*.js', '*.config.js', 'scripts/**/*.js'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    },
    {
        files: ['frontend/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.serviceworker },
        },
    },
    {
        // I test E2E contengono funzioni eseguite nel browser (page.evaluate)
        files: ['test/e2e/**/*.js'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
    {
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
        },
    },
];
