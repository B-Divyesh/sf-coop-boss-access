import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dockerfile = await readFile('Dockerfile', 'utf8');
const deployment = await readFile('scripts/deploy-container.sh', 'utf8');
const verification = await readFile('scripts/verify-container-release.sh', 'utf8');
const factoryDeployment = JSON.parse(await readFile('.factory/container-deploy.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(dockerfile, /^ARG BUILD_SHA=dev$/m, 'Docker images must identify an omitted build argument as dev, never an old release');
assert.doesNotMatch(dockerfile, /BUILD_SHA=9b3c663e76c1f930eb376b78d038509106c621bf/, 'Dockerfile must not retain the stale release identity');
assert.match(deployment, /--min-replicas 1/);
assert.match(deployment, /--max-replicas 1/);
assert.match(deployment, /verify-container-release\.sh/);
assert.match(deployment, /test:browser-joins/);
assert.match(verification, /containerapp replica list/);
assert.deepEqual(
  { minReplicas: factoryDeployment.minReplicas, maxReplicas: factoryDeployment.maxReplicas },
  { minReplicas: 1, maxReplicas: 1 },
  'the work-order deployment contract must keep process-local rooms on one replica'
);
assert.equal(packageJson.devDependencies.playwright, '1.58.2');
console.log('Release contract: build identity, stable one-replica deployment, browser joins, and browser version are pinned.');
