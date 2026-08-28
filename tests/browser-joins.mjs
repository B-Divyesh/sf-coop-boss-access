import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const suppliedOrigin = process.env.APP_URL;
const port = process.env.BROWSER_JOIN_PORT ?? '18081';
const origin = suppliedOrigin ?? `http://127.0.0.1:${port}`;
const attempts = Number(process.env.BROWSER_JOIN_ATTEMPTS ?? 20);
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return;
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

const browser = await chromium.launch();
try {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const host = await hostContext.newPage();
      await host.goto(`${origin}/host`, { waitUntil: 'domcontentloaded' });
      const code = (await host.locator('.room-code').textContent({ timeout: 5_000 })).trim();
      assert.match(code, /^[A-Z2-9]{4}$/);

      const phone = await phoneContext.newPage();
      await phone.goto(`${origin}/join`, { waitUntil: 'domcontentloaded' });
      const codeInput = phone.getByLabel('Four-character room code');
      await codeInput.focus();
      await phone.keyboard.insertText(`${code[0]}-${code.slice(1)}`);
      assert.equal(await codeInput.inputValue(), code, 'pasted punctuation must be removed before the four valid characters are kept');
      await phone.getByLabel('Your display name').fill(`Phone ${attempt}`);
      await phone.getByRole('button', { name: 'Join the team' }).click();
      await phone.getByRole('heading', { name: /You are Ward/i }).waitFor({ timeout: 5_000 });
      await host.getByText(`Phone ${attempt}`, { exact: true }).waitFor({ timeout: 5_000 });
    } finally {
      await phoneContext.close();
      await hostContext.close();
    }
    console.log(`Independent browser join ${attempt}/${attempts}: passed`);
  }
} finally {
  await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
