import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);

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
let changedStableAsset = false;

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
  });
  const cacheNames = await page.evaluate(() => caches.keys());

  if (!suppliedOrigin) {
    const beforeUpdate = cacheNames.find((key) => key.startsWith('coop-boss-shell-'));
    const marker = `\n<!-- same-url-update-${Date.now()} -->\n`;
    const favicon = await readFile('dist/favicon.svg', 'utf8');
    await writeFile('dist/favicon.svg', `${favicon}${marker}`);
    changedStableAsset = true;
    await execFileAsync(process.execPath, ['scripts/build-sw.mjs']);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    let update;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      update = await page.evaluate(async () => {
        const keys = await caches.keys();
        const favicons = [];
        for (const key of keys.filter((name) => name.startsWith('coop-boss-shell-'))) {
          const response = await (await caches.open(key)).match('/favicon.svg');
          if (response) favicons.push(await response.text());
        }
        return { keys, favicons };
      });
      if (!update.keys.includes(beforeUpdate)
        && !update.keys.includes('coop-boss-shell-old-release')
        && update.favicons.some((favicon) => /same-url-update-\d+/.test(favicon))) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(!update.keys.includes('coop-boss-shell-old-release'), 'activation must remove a stale shell cache');
    assert.ok(!update.keys.includes(beforeUpdate), 'activation must remove the prior content cache');
    assert.ok(update.favicons.some((favicon) => /same-url-update-\d+/.test(favicon)), 'updated worker must bypass the immutable HTTP cache for a changed stable URL');
  } else {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(() => caches.keys().then((keys) => !keys.includes('coop-boss-shell-old-release')));
  }

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.match(await page.locator('h1').innerText(), /Two roles\.\s*One dragon\./i);
  console.log('PWA regression: shell precache, real same-URL asset update, stale cleanup, and cold offline reload passed.');
} finally {
  await browser.close();
  if (changedStableAsset) {
    await copyFile('public/favicon.svg', 'dist/favicon.svg');
    await execFileAsync(process.execPath, ['scripts/build-sw.mjs']);
  }
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
