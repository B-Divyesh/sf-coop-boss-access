import assert from 'node:assert/strict';

const endpoint = process.env.WS_URL ?? 'ws://127.0.0.1:8080/ws';

function connect(firstMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const listeners = [];
    const states = [];
    socket.addEventListener('open', () => socket.send(JSON.stringify(firstMessage)));
    socket.addEventListener('error', reject);
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'error') reject(new Error(event.message));
      if (event.type === 'state') states.push(event.room);
      for (const listener of listeners.splice(0)) listener();
    });
    resolve({
      socket,
      send: (message) => socket.send(JSON.stringify(message)),
      waitFor: async (predicate, timeout = 3000) => {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
          const match = states.findLast(predicate);
          if (match) return match;
          await new Promise((wake) => {
            listeners.push(wake);
            setTimeout(wake, 50);
          });
        }
        throw new Error('Timed out waiting for room state');
      }
    });
  });
}

const host = await connect({ type: 'create', client_id: 'host-e2e-0001' });
const created = await host.waitFor((room) => room.code?.length === 4);
const ward = await connect({ type: 'join', code: created.code, name: 'Mina', client_id: 'ward-e2e-0001' });
const surge = await connect({ type: 'join', code: created.code, name: 'Ivo', client_id: 'surge-e2e-001' });
const ready = await host.waitFor((room) => room.players.length === 2);
assert.deepEqual(ready.players.map((player) => player.role), ['ward', 'surge']);

host.send({ type: 'start' });
await host.waitFor((room) => room.phase === 'playing');
for (let tap = 0; tap < 4; tap += 1) {
  ward.send({ type: 'action', action: 'build' });
  surge.send({ type: 'action', action: 'build' });
  await new Promise((resolve) => setTimeout(resolve, 125));
}
ward.send({ type: 'action', action: 'share' });
surge.send({ type: 'action', action: 'share' });
const powered = await host.waitFor((room) => room.shield >= 48 && room.boost > 0);
assert.equal(powered.phase, 'playing');
assert.ok(powered.remaining_ms < 180_000);

ward.socket.close();
surge.socket.close();
host.socket.close();
console.log(`E2E room ${created.code}: host + WARD + SURGE synchronized and shared both powers.`);
