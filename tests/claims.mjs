import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Claims server did not become ready at ${origin}`);
}

function connect(websocketOrigin, firstMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${websocketOrigin}/ws`);
    const states = [];
    const listeners = [];
    let failure;
    socket.addEventListener('open', () => socket.send(JSON.stringify(firstMessage)), { once: true });
    socket.addEventListener('error', () => {
      failure = new Error('WebSocket connection failed');
      for (const listener of listeners.splice(0)) listener();
    });
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'error') failure = new Error(event.message);
      if (event.type === 'state') states.push(event.room);
      for (const listener of listeners.splice(0)) listener();
    });
    socket.addEventListener('open', () => resolve({
      send: (message) => socket.send(JSON.stringify(message)),
      close: () => new Promise((done) => {
        if (socket.readyState === WebSocket.CLOSED) return done();
        socket.addEventListener('close', done, { once: true });
        socket.close();
      }),
      waitFor: async (predicate, timeout = 4_000) => {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
          if (failure) throw failure;
          const match = states.findLast(predicate);
          if (match) return match;
          await new Promise((wake) => {
            listeners.push(wake);
            setTimeout(wake, 40);
          });
        }
        if (failure) throw failure;
        throw new Error('Timed out waiting for a room state');
      }
    }), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

async function expectJoinError(websocketOrigin, message) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${websocketOrigin}/ws`);
    const timer = setTimeout(() => reject(new Error('Timed out waiting for join rejection')), 4_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify(message)), { once: true });
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'error') {
        clearTimeout(timer);
        socket.close();
        resolve(event.message);
      }
    });
    socket.addEventListener('error', reject, { once: true });
  });
}

const tests = [
  {
    id: 'demo-one-click',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'networkidle' });
      const sampleAction = page.getByRole('button', { name: 'Try it with sample data' });
      const [actionBox, noteBox] = await Promise.all([
        sampleAction.boundingBox(),
        page.getByText('The sample opens with two players ready.').boundingBox()
      ]);
      assert.ok(actionBox && actionBox.y >= 0 && actionBox.y + actionBox.height <= 900, `sample action is below the 900px desktop first screen at y=${actionBox?.y}`);
      assert.ok(noteBox && noteBox.y >= 0 && noteBox.y + noteBox.height <= 900, `sample outcome note is below the 900px desktop first screen at y=${noteBox?.y}`);
      await sampleAction.click();
      await page.waitForURL(`${origin}/demo`);
      await page.getByRole('heading', { level: 1, name: 'Try the sample battle' }).waitFor();
      await page.getByLabel('Demo controls').getByText('Demo — sample data, nothing is saved').waitFor();
      await page.getByText('Mina · Ward').waitFor();
      await page.getByText('Ivo · Surge').waitFor();
      await page.locator('.demo-banner[data-connection="online"]').waitFor();
      await page.getByRole('button', { name: 'Boost strikes' }).click();
      await page.getByLabel(/Shared surge boost: 28%/).waitFor();
      await page.getByRole('button', { name: 'Reset demo' }).click();
      await page.getByLabel(/Shared surge boost: 0%/).waitFor();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const bannerBox = await page.getByLabel('Demo controls').boundingBox();
      assert.ok(bannerBox && bannerBox.y >= 0 && bannerBox.y + bannerBox.height <= 900, `the demo banner left the viewport at y=${bannerBox?.y}`);
      await page.getByRole('button', { name: 'Start for real' }).click();
      await page.waitForURL(origin + '/');
      await page.getByRole('heading', { level: 1, name: 'Beat a boss together with phone controls' }).waitFor();
      await page.goto(`${origin}/?demo=1`);
      await page.getByRole('heading', { level: 1, name: 'Try the sample battle' }).waitFor();
      await context.close();
    }
  },
  {
    id: 'role-effects',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      await page.locator('.demo-banner[data-connection="online"]').waitFor();
      await page.getByRole('button', { name: 'Build Ward charge' }).click();
      await page.getByText('40% charge', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Share shield' }).click();
      await page.getByLabel(/Shared ward shield: 48%/).waitFor();
      await page.getByRole('button', { name: 'Boost strikes' }).click();
      await page.getByLabel(/Shared surge boost: 28%/).waitFor();
      assert.match(await page.locator('.announcement').innerText(), /Ivo boosted every team strike/);
      await context.close();
    }
  },
  {
    id: 'demo-isolation',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        localStorage.setItem('coop-client-id', 'real-client-sentinel');
        localStorage.setItem('high-contrast', 'false');
        sessionStorage.setItem('controller-name', 'Real player');
      });
      const page = await context.newPage();
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      await page.locator('.demo-banner[data-connection="online"]').waitFor();
      await page.getByRole('button', { name: /high contrast/i }).click();
      const storage = await page.evaluate(() => ({
        client: localStorage.getItem('coop-client-id'),
        realContrast: localStorage.getItem('high-contrast'),
        realName: sessionStorage.getItem('controller-name'),
        demoContrast: sessionStorage.getItem('demo:coop-boss:high-contrast')
      }));
      assert.deepEqual(storage, {
        client: 'real-client-sentinel',
        realContrast: 'false',
        realName: 'Real player',
        demoContrast: 'true'
      });
      assert.equal(requests.some((url) => new URL(url).pathname === '/api/pageview'), false, 'demo entry must not write a page view');
      assert.equal(requests.every((url) => new URL(url).origin === origin), true, 'demo traffic must remain same-origin');
      assert.deepEqual(await context.cookies(), [], 'demo must not create cookies');
      await page.getByRole('button', { name: 'Reset demo' }).click();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('demo:coop-boss:high-contrast')), null);
      assert.equal(await page.getByRole('button', { name: /high contrast/i }).getAttribute('aria-pressed'), 'false');
      await context.close();
    }
  },
  {
    id: 'offline-reload',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1, name: 'Try the sample battle' }).waitFor();
      await page.getByText('Mina · Ward').waitFor();
      await page.getByRole('button', { name: 'Build Ward charge' }).click();
      await page.getByRole('button', { name: 'Share shield' }).click();
      await page.getByLabel(/Shared ward shield: 48%/).waitFor();
      await context.close();
    }
  },
  {
    id: 'temporary-rooms',
    run: async ({ browser, origin, websocketOrigin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${origin}/demo`);
      await page.getByText('Demo — sample data, nothing is saved').waitFor();
      const suffix = Date.now();
      const host = await connect(websocketOrigin, { type: 'create', client_id: `claim-host-${suffix}` });
      const created = await host.waitFor((room) => room.code?.length === 4);
      const ward = await connect(websocketOrigin, { type: 'join', code: created.code, name: 'Mina', client_id: `claim-ward-${suffix}` });
      await ward.waitFor((room) => room.players.length === 1);
      await host.close();
      await ward.close();
      const error = await expectJoinError(websocketOrigin, { type: 'join', code: created.code, name: 'Ivo', client_id: `claim-late-${suffix}` });
      assert.match(error, /Room not found/);
      await context.close();
    }
  },
  {
    id: 'free-no-account',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const origins = new Set();
      page.on('request', (request) => origins.add(new URL(request.url()).origin));
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.getByText(/Free to play/).waitFor();
      await page.getByText(/with no account/i).waitFor();
      assert.equal(await page.locator('input[type="password"]').count(), 0);
      assert.equal(await page.getByText(/buy|subscribe|payment|credit card/i).count(), 0);
      assert.deepEqual([...origins], [origin]);
      assert.deepEqual(await context.cookies(), []);
      await context.close();
    }
  },
  {
    id: 'redundant-role-cues',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      await page.getByText('⬡ WARD SHIELD', { exact: true }).waitFor();
      await page.getByText('✦ SURGE BOOST', { exact: true }).waitFor();
      const positions = await page.evaluate(() => {
        const ward = document.querySelector('.ward-power').getBoundingClientRect();
        const surge = document.querySelector('.surge-power').getBoundingClientRect();
        return { ward: ward.left, surge: surge.left };
      });
      assert.ok(positions.ward < positions.surge, 'Ward and Surge must have distinct positions');
      assert.equal(await page.locator('.ward-marker').count(), 1);
      assert.equal(await page.locator('.surge-marker').count(), 1);
      assert.equal(await page.getByLabel(/Shared ward shield/).count(), 1);
      assert.equal(await page.getByLabel(/Shared surge boost/).count(), 1);
      await context.close();
    }
  },
  {
    id: 'accessible-controls',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.keyboard.press('Tab');
      assert.equal((await page.locator(':focus').textContent()).trim(), 'Skip to game');
      const focus = await page.locator(':focus').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(focus, '3px');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      const smallTargets = await page.locator('button').evaluateAll((buttons) => buttons
        .map((button) => ({ name: button.textContent.trim(), box: button.getBoundingClientRect() }))
        .filter(({ box }) => box.width < 44 || box.height < 44));
      assert.deepEqual(smallTargets, [], `touch targets under 44px: ${JSON.stringify(smallTargets)}`);
      const axe = await new AxeBuilder({ page }).analyze();
      assert.deepEqual(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')), []);
      await context.close();

      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const reducedPage = await reduced.newPage();
      await reducedPage.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      const duration = await reducedPage.locator('.access-settings button').first().evaluate((element) => getComputedStyle(element).transitionDuration);
      assert.ok(duration === '0s' || Number.parseFloat(duration) <= 0.001);
      await reduced.close();
    }
  },
  {
    id: 'local-preferences',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const frames = [];
      const origins = new Set();
      page.on('websocket', (websocket) => websocket.on('framesent', (event) => frames.push(String(event.payload))));
      page.on('request', (request) => origins.add(new URL(request.url()).origin));
      await page.goto(`${origin}/host`, { waitUntil: 'networkidle' });
      await page.locator('.room-code').waitFor();
      await page.getByRole('button', { name: /ground markers/i }).click();
      await page.getByRole('button', { name: /high contrast/i }).click();
      await page.getByRole('button', { name: /reduce motion/i }).click();
      assert.deepEqual(await page.evaluate(() => ({
        markers: localStorage.getItem('ground-markers'),
        contrast: localStorage.getItem('high-contrast'),
        motion: localStorage.getItem('reduced-motion')
      })), { markers: 'false', contrast: 'true', motion: 'true' });
      assert.equal(frames.some((frame) => /ground-markers|high-contrast|reduced-motion/.test(frame)), false);
      assert.deepEqual([...origins], [origin]);
      await context.close();
    }
  },
  {
    id: 'room-rules',
    run: async ({ browser, origin, websocketOrigin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${origin}/demo`);
      const suffix = Date.now();
      const host = await connect(websocketOrigin, { type: 'create', client_id: `rules-host-${suffix}` });
      const created = await host.waitFor((room) => room.code?.length === 4);
      const players = [];
      for (let index = 0; index < 8; index += 1) {
        players.push(await connect(websocketOrigin, {
          type: 'join', code: created.code, name: `Player ${index + 1}`, client_id: `rules-player-${index}-${suffix}`
        }));
      }
      const full = await host.waitFor((room) => room.players.length === 8);
      assert.equal(full.players.filter((player) => player.role === 'ward').length, 4);
      assert.equal(full.players.filter((player) => player.role === 'surge').length, 4);
      const error = await expectJoinError(websocketOrigin, {
        type: 'join', code: created.code, name: 'Ninth player', client_id: `rules-ninth-${suffix}`
      });
      assert.match(error, /full \(8 players\)/);
      host.send({ type: 'start' });
      const started = await host.waitFor((room) => room.phase === 'playing');
      assert.ok(started.remaining_ms <= 180_000 && started.remaining_ms > 178_000, `round started at ${started.remaining_ms}ms`);
      await Promise.all(players.map((player) => player.close()));
      await host.close();
      await context.close();
    }
  },
  {
    id: 'anonymous-page-count',
    run: async ({ browser, origin }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(`${origin}/demo`, { waitUntil: 'networkidle' });
      assert.equal(requests.some((url) => new URL(url).pathname === '/api/pageview'), false);
      await context.close();
      const result = await execFileAsync('cargo', ['test', 'health_and_anonymous_page_count_routes_work'], { cwd: process.cwd() });
      assert.match(result.stdout, /test result: ok/);
    }
  },
  {
    id: 'per-client-rate-limit',
    run: async ({ origin }) => {
      const responses = await Promise.all(Array.from({ length: 25 }, () => fetch(`${origin}/api/pageview`, {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.0.2.220, 10.0.0.7' }
      })));
      assert.equal(responses.filter(({ status }) => status === 204).length, 20);
      const rejected = responses.filter(({ status }) => status === 429);
      assert.equal(rejected.length, 5);
      assert.equal(rejected.every((response) => response.headers.has('retry-after')), true);
    }
  }
];

const grepIndex = process.argv.indexOf('--grep');
const grep = grepIndex >= 0 ? process.argv[grepIndex + 1] : process.argv.find((argument) => argument.startsWith('--grep='))?.slice(7);
const selected = grep ? tests.filter(({ id }) => `@claim:${id}`.includes(grep) || grep.includes(`@claim:${id}`)) : tests;
assert.ok(selected.length > 0, `No claim matched ${grep}`);

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'coop-claims-'));
const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const websocketOrigin = `ws://127.0.0.1:${port}`;
const databasePath = path.join(temporaryDirectory, 'claims.db');
const server = spawn('cargo', ['run', '--quiet'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), DATABASE_URL: `sqlite://${databasePath}?mode=rwc` },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

const factoryChrome = '/opt/pw-browsers/chromium-1208/chrome-linux64/chrome';
let browser;
try {
  await waitForServer(origin);
  browser = await chromium.launch(existsSync(factoryChrome) ? { executablePath: factoryChrome } : {});
  for (const test of selected) {
    await test.run({ browser, origin, websocketOrigin });
    console.log(`PASS @claim:${test.id}`);
  }
} catch (error) {
  throw new Error(`${error instanceof Error ? error.stack : error}\nServer output:\n${serverOutput}`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
}
