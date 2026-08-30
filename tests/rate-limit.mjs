import assert from 'node:assert/strict';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const websocketOrigin = origin.replace(/^http/, 'ws');
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
  const sockets = await Promise.all(Array.from({ length: 140 }, (_, index) => new Promise((resolve) => {
    const socket = new WebSocket(`${websocketOrigin}/ws`);
    const finish = (accepted) => resolve({ accepted, socket, index });
    socket.addEventListener('open', () => finish(true), { once: true });
    socket.addEventListener('error', () => finish(false), { once: true });
  })));
  const admitted = sockets.filter(({ accepted }) => accepted);
  const rejected = sockets.filter(({ accepted }) => !accepted);
  for (const { socket } of admitted) socket.close();
  assert.ok(rejected.length >= 1, 'WebSocket create/join bursts above the quota must be rejected during upgrade');
  assert.ok(admitted.length <= 121, `expected at most the configured burst plus one refill, admitted ${admitted.length}`);
  websocketSummary = `${admitted.length} admitted, ${rejected.length} rejected`;
}

console.log(`Rate-limit load regression: page views ${pageviewSummary}; WebSockets ${websocketSummary}.`);
