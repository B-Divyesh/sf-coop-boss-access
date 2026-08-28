import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const suppliedOrigin = process.env.APP_URL;
const port = process.env.PWA_TEST_PORT ?? '18080';
const origin = suppliedOrigin ?? `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready at ${origin}`);
}

if (!suppliedOrigin) {
  server = spawn('cargo', ['run', '--quiet'], {
    env: { ...process.env, PORT: port, DATABASE_URL: 'sqlite::memory:' },
    stdio: 'ignore'
  });
  await waitForServer();
}

const factoryChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
const browser = await chromium.launch(existsSync(factoryChrome) ? { executablePath: factoryChrome } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const shell = await page.evaluate(async () => {
    const keys = await caches.keys();
    const current = keys.find((key) => key.startsWith('coop-boss-shell-'));
    const requests = current ? await (await caches.open(current)).keys() : [];
    return { keys, requests: requests.map((request) => new URL(request.url).pathname) };
  });
  assert.match(shell.keys.find((key) => key.startsWith('coop-boss-shell-')) ?? '', /^coop-boss-shell-[a-f0-9]{12}$/);
  for (const required of [
    (path) => /^\/assets\/.*\.css$/.test(path),
    (path) => /^\/assets\/.*\.js$/.test(path),
    (path) => path === '/fonts/atkinson-hyperlegible-next-latin.woff2',
    (path) => path === '/fonts/bowlby-one-sc-latin.woff2'
  ]) {
    assert.ok(shell.requests.some(required), 'service-worker shell is missing a built JS, CSS, or local font asset');
  }

  await page.evaluate(async () => {
    const old = await caches.open('coop-boss-shell-old-release');
    await old.put('/stale', new Response('stale'));
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheNames = await page.evaluate(() => caches.keys());
  assert.ok(!cacheNames.includes('coop-boss-shell-old-release'), 'activation must remove a stale shell cache');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.match(await page.locator('h1').innerText(), /Two roles\.\s*One dragon\./i);
  console.log('PWA regression: versioned shell precaches JS/CSS/fonts, cleans an old cache, and cold offline reload renders the home screen.');
} finally {
  await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
