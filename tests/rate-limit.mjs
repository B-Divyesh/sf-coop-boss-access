import assert from 'node:assert/strict';

const origin = process.env.APP_URL ?? 'http://127.0.0.1:8080';
const websocketOrigin = origin.replace(/^http/, 'ws');

const pageviews = await Promise.all(Array.from({ length: 25 }, () => fetch(`${origin}/api/pageview`, { method: 'POST' })));
const pageviewStatuses = pageviews.reduce((counts, response) => counts.set(response.status, (counts.get(response.status) ?? 0) + 1), new Map());
assert.ok((pageviewStatuses.get(429) ?? 0) >= 1, 'page-view bursts above the quota must receive 429');
assert.ok((pageviewStatuses.get(204) ?? 0) <= 20, 'no more than the configured page-view burst may be counted');

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

console.log(`Rate-limit load regression: page views ${JSON.stringify(Object.fromEntries(pageviewStatuses))}; WebSockets ${admitted.length} admitted, ${rejected.length} rejected.`);
