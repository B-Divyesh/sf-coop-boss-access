import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const runtimeErrors = [];
const requestOrigins = new Set();
page.on('pageerror', (error) => runtimeErrors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
page.on('request', (request) => requestOrigins.add(new URL(request.url()).origin));

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, '390px layout must not overflow horizontally');

  await page.keyboard.press('Tab');
  assert.equal((await page.locator(':focus').textContent()).trim(), 'Skip to game');
  const focus = await page.locator(':focus').evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
  });
  assert.equal(focus.width, '3px');
  assert.equal(focus.style, 'solid');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'main');

  await page.goto(`${origin}/privacy`, { waitUntil: 'networkidle' });
  await page.getByText(/short-lived counts are not written to the database/i).waitFor();
  assert.deepEqual([...requestOrigins], [new URL(origin).origin], 'runtime network requests must remain same-origin');
  assert.deepEqual(runtimeErrors, [], 'browser must emit no console or page errors');

  const homeResponse = await fetch(origin);
  assert.equal(homeResponse.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  assert.equal(homeResponse.headers.get('cache-control'), 'no-cache');
  const assetPath = (await homeResponse.text()).match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  assert.equal((await fetch(`${origin}${assetPath}`)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${origin}/fonts/atkinson-hyperlegible-next-latin.woff2`)).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(`${origin}/api/pageview`, { method: 'PUT' })).status, 405);

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${origin}/host`, { waitUntil: 'networkidle' });
  const duration = await reducedPage.locator('.access-settings button').first().evaluate((element) => getComputedStyle(element).transitionDuration);
  assert.ok(duration === '0s' || Number.parseFloat(duration) <= 0.001, `reduced-motion transition was ${duration}`);
  await reducedContext.close();

  console.log(`Browser quality: keyboard focus, 390px layout, reduced motion, privacy, same-origin networking, and response policy passed (${focus.color}).`);
} finally {
  await browser.close();
}
