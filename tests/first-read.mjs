import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const factoryChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const browser = await chromium.launch(existsSync(factoryChrome) ? { executablePath: factoryChrome } : {});

async function inspectFirstScreen(label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: 'Beat a boss together with phone controls' }).waitFor();
  await page.getByText('For friends sharing one screen, phones become clear two-button controls with no account.').waitFor();
  const sample = page.getByRole('button', { name: 'Try it with sample data' });
  const note = page.getByText('The sample opens with two players ready.');
  const [sampleBox, noteBox] = await Promise.all([sample.boundingBox(), note.boundingBox()]);
  for (const [name, box] of [['sample action', sampleBox], ['sample outcome', noteBox]]) {
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= viewport.height,
      `${label} ${name} must be visible before scrolling`
    );
  }

  await sample.click();
  await page.waitForURL(`${origin}/demo`);
  await page.getByRole('heading', { level: 1, name: 'Try the sample battle' }).waitFor();
  await page.getByText('Demo — sample data, nothing is saved').waitFor();
  await page.getByText('Mina · Ward').waitFor();
  await page.getByText('Ivo · Surge').waitFor();
  assert.equal(requests.includes('/api/pageview'), true, `${label} home visit should record only its anonymous page view`);
  assert.equal(requests.filter((path) => path === '/api/pageview').length, 1, `${label} demo must not add a page view`);
  await page.getByRole('button', { name: 'Boost strikes' }).click();
  await page.getByLabel(/Shared surge boost: 28%/).waitFor();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByLabel(/Shared surge boost: 0%/).waitFor();
  await page.getByRole('button', { name: 'Start for real' }).click();
  await page.waitForURL(`${origin}/`);
  assert.deepEqual(errors, [], `${label} first-read flow emitted browser errors`);
  await context.close();
}

try {
  await inspectFirstScreen('desktop', { width: 1440, height: 900 });
  await inspectFirstScreen('phone', { width: 390, height: 844 });
  console.log('First read: desktop and phone clearly show the boss-game job, friend audience, and sample first action before scrolling; the demo plays, resets, and exits without an extra page view.');
} finally {
  await browser.close();
}
