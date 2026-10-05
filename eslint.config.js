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
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
        },
    },
];
