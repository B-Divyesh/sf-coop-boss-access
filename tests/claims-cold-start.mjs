import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const target = await mkdtemp(path.join(os.tmpdir(), 'coop-claims-cold-target-'));

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'test:claims', '--', '--grep', '@claim:demo-one-click'], {
      cwd: process.cwd(),
      env: { ...process.env, CARGO_TARGET_DIR: target },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (exitCode !== 0) throw new Error(`cold-cache claim command exited ${exitCode}`);
  console.log('Cold-cache claim regression: the documented claim command built Rust before its readiness check and passed.');
} finally {
  await rm(target, { recursive: true, force: true });
}
