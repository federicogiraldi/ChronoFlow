// Genera le icone PNG della PWA a partire da frontend/icons/icon.svg (usa Chromium di Playwright).
// Uso: node scripts/generate-icons.js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/icons');
const svg = await readFile(path.join(dir, 'icon.svg'), 'utf8');

// [nome file, dimensione, margine per le icone "maskable" (Android ritaglia i bordi)]
const icons = [
    ['icon-192.png', 192, 0],
    ['icon-512.png', 512, 0],
    ['icon-maskable-512.png', 512, 0.12],
    ['apple-touch-icon.png', 180, 0.06],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, padding] of icons) {
    const inner = Math.round(size * (1 - 2 * padding));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
        `<body style="margin:0;background:${padding ? '#1f6fc0' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
           <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
         </body>`
    );
    await page.screenshot({ path: path.join(dir, name), omitBackground: padding === 0 });
    console.log(`✔ ${name}`);
}
await browser.close();
