import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dockerfile = await readFile('Dockerfile', 'utf8');
assert.match(dockerfile, /^ARG BUILD_SHA=dev$/m, 'Docker images must identify an omitted build argument as dev, never an old release');
assert.doesNotMatch(dockerfile, /BUILD_SHA=9b3c663e76c1f930eb376b78d038509106c621bf/, 'Dockerfile must not retain the stale release identity');
console.log('Release contract: Docker build identity defaults safely to dev.');
