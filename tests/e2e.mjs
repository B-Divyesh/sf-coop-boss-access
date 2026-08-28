import assert from 'node:assert/strict';

const endpoint = process.env.WS_URL ?? 'ws://127.0.0.1:8080/ws';

function connect(firstMessage) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const listeners = [];
    const states = [];
    let failure;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(firstMessage));
      resolve({
        socket,
        send: (message) => socket.send(JSON.stringify(message)),
        close: () => new Promise((done) => {
          socket.addEventListener('close', done, { once: true });
          socket.close();
        }),
        waitFor: async (predicate, timeout = 3000) => {
          const until = Date.now() + timeout;
          while (Date.now() < until) {
            if (failure) throw failure;
            const match = states.findLast(predicate);
            if (match) return match;
            await new Promise((wake) => {
              listeners.push(wake);
              setTimeout(wake, 50);
            });
          }
          if (failure) throw failure;
          throw new Error('Timed out waiting for room state');
        }
      });
    });
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
  });
}

const attempts = Number(process.env.E2E_ATTEMPTS ?? 1);
const joinOnly = process.env.JOIN_ONLY === '1';
assert.ok(Number.isInteger(attempts) && attempts > 0, 'E2E_ATTEMPTS must be a positive integer');

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const suffix = `${Date.now()}-${attempt}`;
  const host = await connect({ type: 'create', client_id: `host-e2e-${suffix}` });
  const created = await host.waitFor((room) => room.code?.length === 4);
  const ward = await connect({ type: 'join', code: created.code, name: 'Mina', client_id: `ward-e2e-${suffix}` });
  const surge = await connect({ type: 'join', code: created.code, name: 'Ivo', client_id: `surge-e2e-${suffix}` });
  const ready = await host.waitFor((room) => room.players.length === 2);
  assert.deepEqual(ready.players.map((player) => player.role), ['ward', 'surge']);

  if (!joinOnly) {
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
  }

  await Promise.all([ward.close(), surge.close()]);
  await host.close();
  console.log(`E2E room ${created.code}: attempt ${attempt}/${attempts} joined WARD + SURGE${joinOnly ? '' : ' and shared both powers'}.`);
}
