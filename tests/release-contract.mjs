import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dockerfile = await readFile('Dockerfile', 'utf8');
const deployment = await readFile('scripts/deploy-container.sh', 'utf8');
const verification = await readFile('scripts/verify-container-release.sh', 'utf8');
const factoryDeployment = JSON.parse(await readFile('.factory/container-deploy.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const claims = JSON.parse(await readFile('.factory/claims.json', 'utf8'));
const claimRunner = await readFile('tests/claims.mjs', 'utf8');
const demoDocumentation = await readFile('.factory/demo.md', 'utf8');
const app = await readFile('src/App.svelte', 'utf8');
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
assert.ok(claims.length > 0, 'the visitor claims contract must not be empty');
assert.equal(new Set(claims.map(({ id }) => id)).size, claims.length, 'claim IDs must be unique');
for (const claim of claims) {
  assert.equal(claim.test, `npm run test:claims -- --grep @claim:${claim.id}`);
  assert.equal(claimRunner.match(new RegExp(`id: '${claim.id}'`, 'g'))?.length, 1, `@claim:${claim.id} must map to exactly one test`);
}
assert.match(app, /Try it with sample data/);
assert.match(app, /Demo — sample data, nothing is saved/);
assert.match(app, />Reset demo</);
assert.match(app, />Start for real</);
assert.match(demoDocumentation, /https:\/\/coop-boss-access\.sociobot\.in\/demo/);
console.log('Release contract: identity, one-replica deployment, browser joins, demo, claims, and browser version are pinned.');
