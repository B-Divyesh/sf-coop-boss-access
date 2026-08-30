import { describe, expect, it } from 'vitest';
import { assertDeploymentState } from '../scripts/check-deployment-state.mjs';

const sha = '9ca4c5f15b56b166af1bb2065c19e3757c65d842';
const image = `sociobotregistry.azurecr.io/sf-coop-boss-access:${sha.slice(0, 12)}`;
const revision = 'sf-coop-boss-access--0000008';

function deployment(maxReplicas = 1) {
  return {
    properties: {
      provisioningState: 'Succeeded',
      runningStatus: 'Running',
      latestReadyRevisionName: revision,
      configuration: { activeRevisionsMode: 'Single' },
      template: {
        containers: [{ image }],
        scale: { minReplicas: 1, maxReplicas }
      }
    }
  };
}

function replica(suffix: string) {
  return { name: `${revision}-${suffix}`, properties: { runningState: 'Running' } };
}

const health = { build: sha, status: 'ok' };

describe('release deployment topology', () => {
  it('rejects the verifier topology with three allowed and running replicas', () => {
    expect(() => assertDeploymentState({
      app: deployment(3),
      replicas: [replica('9v6wj'), replica('drqpw'), replica('nl5bh')],
      health,
      expectedSha: sha,
      expectedImage: image
    })).toThrow('process-local rooms require maxReplicas=1');
  });

  it('rejects maxReplicas=3 even when Azure has scaled down to one active replica', () => {
    expect(() => assertDeploymentState({
      app: deployment(3),
      replicas: [replica('drqpw')],
      health,
      expectedSha: sha,
      expectedImage: image
    })).toThrow('process-local rooms require maxReplicas=1');
  });

  it('rejects more than one running replica', () => {
    expect(() => assertDeploymentState({
      app: deployment(),
      replicas: [replica('first'), replica('second')],
      health,
      expectedSha: sha,
      expectedImage: image
    })).toThrow('exactly one replica must be running');
  });

  it('accepts one healthy replica with the exact release identity', () => {
    expect(() => assertDeploymentState({
      app: deployment(),
      replicas: [replica('only')],
      health,
      expectedSha: sha,
      expectedImage: image
    })).not.toThrow();
  });
});
