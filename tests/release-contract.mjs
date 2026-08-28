import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dockerfile = await readFile('Dockerfile', 'utf8');
const deployment = await readFile('scripts/deploy-container.sh', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(dockerfile, /^ARG BUILD_SHA=dev$/m, 'Docker images must identify an omitted build argument as dev, never an old release');
assert.doesNotMatch(dockerfile, /BUILD_SHA=9b3c663e76c1f930eb376b78d038509106c621bf/, 'Dockerfile must not retain the stale release identity');
assert.match(deployment, /--min-replicas 1/);
assert.match(deployment, /--max-replicas 1/);
assert.match(deployment, /deployed_image.*min_replicas.*max_replicas/s, 'deployment must verify its image and one-replica invariant');
assert.equal(packageJson.devDependencies.playwright, '1.58.2');
console.log('Release contract: build identity, one-replica deployment, and browser version are pinned.');
