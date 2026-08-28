import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`${command} exited ${code}\n${output}`)));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

await run('cargo', ['build', '--quiet']);
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'coop-runtime-'));
const port = await freePort();
const binary = path.resolve('target/debug/coop-boss-access');
const process = spawn(binary, [], {
  cwd: temporaryDirectory,
  env: { PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
process.stdout.on('data', (chunk) => { output += chunk; });
process.stderr.on('data', (chunk) => { output += chunk; });

try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200, 'PORT-only process must become healthy');
  assert.match(output, /runtime configuration ready; coop boss server ready/);
  assert.match(output, /"database_source":"default"/);
  assert.match(output, /"port_source":"supplied"/);
  console.log('Runtime contract: PORT-only startup is healthy and logs default/supplied configuration sources.');
} finally {
  process.kill('SIGTERM');
  await new Promise((resolve) => process.once('exit', resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
}
