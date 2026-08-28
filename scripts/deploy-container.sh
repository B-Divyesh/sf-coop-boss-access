#!/usr/bin/env bash
set -euo pipefail

release_sha="${1:-$(git rev-parse HEAD)}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 [40-character git SHA]" >&2
  exit 2
fi

resource_group="${COOP_AZURE_RESOURCE_GROUP:-sociobot}"
registry="${COOP_ACR_NAME:-sociobotregistry}"
container_app="${COOP_CONTAINER_APP:-sf-coop-boss-access}"
image_repository="${COOP_IMAGE_REPOSITORY:-sf-coop-boss-access}"
image="${registry}.azurecr.io/${image_repository}:${release_sha:0:12}"

az acr build \
  --resource-group "$resource_group" \
  --registry "$registry" \
  --image "${image_repository}:${release_sha:0:12}" \
  --build-arg "BUILD_SHA=$release_sha" \
  .

az containerapp update \
  --resource-group "$resource_group" \
  --name "$container_app" \
  --image "$image" \
  --min-replicas 1 \
  --max-replicas 1 \
  --output none

mapfile -t deployment_state < <(
  az containerapp show \
    --resource-group "$resource_group" \
    --name "$container_app" \
    --query '[properties.template.containers[0].image, properties.template.scale.minReplicas, properties.template.scale.maxReplicas]' \
    --output tsv
)
deployed_image="${deployment_state[0]:-}"
min_replicas="${deployment_state[1]:-}"
max_replicas="${deployment_state[2]:-}"

if [[ "$deployed_image" != "$image" || "$min_replicas" != "1" || "$max_replicas" != "1" ]]; then
  echo "Deployment invariant failed: image=$deployed_image replicas=$min_replicas..$max_replicas" >&2
  exit 1
fi

for attempt in {1..60}; do
  live_build="$(curl --fail --silent --show-error https://coop-boss-access.sociobot.in/health | sed -n 's/.*"build":"\([^"]*\)".*/\1/p' || true)"
  if [[ "$live_build" == "$release_sha" ]]; then
    echo "Deployed $release_sha as $image with exactly one replica."
    exit 0
  fi
  sleep 2
done

echo "Deployment did not report build $release_sha within 120 seconds." >&2
exit 1
