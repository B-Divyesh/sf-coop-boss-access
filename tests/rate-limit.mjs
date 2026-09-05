import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const scope = process.env.RATE_LIMIT_SCOPE ?? 'all';
assert.ok(['all', 'pageview', 'websocket'].includes(scope), 'RATE_LIMIT_SCOPE must be all, pageview, or websocket');

let pageviewSummary = 'skipped';
if (scope !== 'websocket') {
  const pageviews = await Promise.all(Array.from({ length: 25 }, () => fetch(`${origin}/api/pageview`, { method: 'POST' })));
  const pageviewStatuses = pageviews.reduce((counts, response) => counts.set(response.status, (counts.get(response.status) ?? 0) + 1), new Map());
  assert.equal(pageviewStatuses.get(204) ?? 0, 20, 'a fresh process must admit the documented 20-request page-view burst');
  assert.equal(pageviewStatuses.get(429) ?? 0, 5, 'every page view above the documented burst must receive 429');
  for (const response of pageviews.filter(({ status }) => status === 429)) {
    assert.notEqual(response.headers.get('retry-after'), null, 'page-view 429 responses must include Retry-After');
  }
  pageviewSummary = JSON.stringify(Object.fromEntries(pageviewStatuses));
}

let websocketSummary = 'skipped';
if (scope !== 'pageview') {
  const webSocketUpgrade = (endpoint) => new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64')
      }
    });
    request.once('upgrade', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, retryAfter: response.headers['retry-after'] });
    });
    request.once('response', (response) => {
      response.resume();
      response.once('end', () => resolve({ status: response.statusCode, retryAfter: response.headers['retry-after'] }));
    });
    request.once('error', reject);
    request.end();
  });

  const upgrades = await Promise.all(Array.from({ length: 121 }, () => webSocketUpgrade(`${origin}/ws`)));
  const admitted = upgrades.filter(({ status }) => status === 101);
  const rejected = upgrades.filter(({ status }) => status === 429);
  assert.equal(admitted.length, 120, `the documented WebSocket burst must admit exactly 120 upgrades, got ${admitted.length}`);
  assert.equal(rejected.length, 1, `WebSocket upgrade 121 must receive 429, got ${JSON.stringify(upgrades.map(({ status }) => status))}`);
  assert.notEqual(rejected[0].retryAfter, undefined, 'WebSocket 429 responses must include Retry-After');
  websocketSummary = `${admitted.length} admitted, ${rejected.length} rejected with Retry-After`;
}

console.log(`Rate-limit load regression: page views ${pageviewSummary}; WebSockets ${websocketSummary}.`);
