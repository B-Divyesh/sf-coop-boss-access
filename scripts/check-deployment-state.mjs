import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * @param {{
 *   app: any,
 *   replicas: Array<{name?: string, properties?: {runningState?: string}}>,
 *   health: unknown,
 *   expectedSha: string,
 *   expectedImage: string
 * }} state
 */
export function assertDeploymentState({ app, replicas, health, expectedSha, expectedImage }) {
  assert.match(expectedSha, /^[0-9a-f]{40}$/, 'expected SHA must contain 40 lowercase hexadecimal characters');

  const revision = app?.properties?.latestReadyRevisionName;
  const template = app?.properties?.template;
  const scale = template?.scale;
  const image = template?.containers?.[0]?.image;

  assert.equal(app?.properties?.provisioningState, 'Succeeded', 'Container App provisioning must be complete');
  assert.equal(app?.properties?.runningStatus, 'Running', 'Container App must be running');
  assert.equal(app?.properties?.configuration?.activeRevisionsMode, 'Single', 'only the latest revision may receive traffic');
  assert.equal(image, expectedImage, `deployed image must be ${expectedImage}`);
  assert.equal(scale?.minReplicas, 1, 'process-local rooms require minReplicas=1');
  assert.equal(scale?.maxReplicas, 1, 'process-local rooms require maxReplicas=1');
  assert.ok(revision, 'a ready revision must be present');

  const running = replicas.filter((replica) => replica?.properties?.runningState === 'Running');
  assert.equal(running.length, 1, 'exactly one replica must be running');
  assert.ok(
    running[0].name === revision || running[0].name?.startsWith(`${revision}-`),
    'the running replica must belong to the latest ready revision'
  );

  assert.deepEqual(health, { build: expectedSha, status: 'ok' }, 'public health identity must match the release');
}

async function main() {
  const [appPath, replicasPath, healthPath, expectedSha, expectedImage] = process.argv.slice(2);
  if (!appPath || !replicasPath || !healthPath || !expectedSha || !expectedImage) {
    throw new Error('Usage: check-deployment-state.mjs <app.json> <replicas.json> <health.json> <sha> <image>');
  }

  const [app, replicas, health] = await Promise.all(
    [appPath, replicasPath, healthPath].map(async (path) => JSON.parse(await readFile(path, 'utf8')))
  );
  assertDeploymentState({ app, replicas, health, expectedSha, expectedImage });
  console.log(`Deployment state: ${expectedSha} is healthy on exactly one replica.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Deployment invariant failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
