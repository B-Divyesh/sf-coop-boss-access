import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const factoryChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const browser = await chromium.launch(existsSync(factoryChrome) ? { executablePath: factoryChrome } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

async function assertAccessible(target, label) {
  const results = await new AxeBuilder({ page: target }).analyze();
  const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  assert.deepEqual(severe, [], `${label} has serious/critical accessibility violations:\n${severe.map((item) => `${item.id}: ${item.help}`).join('\n')}`);
  console.log(`${label}: ${results.violations.length} total, 0 serious/critical axe violations`);
}

for (const path of ['/', '/demo', '/host', '/join', '/privacy', '/terms', '/not-a-real-page']) {
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  await assertAccessible(page, path);
}

await page.goto(`${origin}/host`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /high contrast/i }).click();
await assertAccessible(page, '/host high contrast');
await page.getByRole('button', { name: /high contrast/i }).click();
await page.getByRole('button', { name: /reduce motion/i }).click();
await assertAccessible(page, '/host reduced motion');

const code = (await page.locator('.room-code').textContent()).trim();
const controllerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const controller = await controllerContext.newPage();
await controller.goto(`${origin}/join?room=${code}`);
await controller.getByLabel('Your display name').fill('Axe Player');
await controller.getByRole('button', { name: 'Join the team' }).click();
await controller.getByRole('heading', { name: /You are Ward/i }).waitFor();
await assertAccessible(controller, '/join connected controller');

await browser.close();
