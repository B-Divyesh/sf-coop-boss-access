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

for attempt in {1..60}; do
  if scripts/verify-container-release.sh "$release_sha"; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "${ready:-false}" != "true" ]]; then
  echo "Deployment did not reach the required image, identity, and one-replica state within 120 seconds." >&2
  exit 1
fi

# Observe the invariant beyond the first successful control-plane read. This
# catches a release wrapper that rewrites the scale setting immediately after
# the image update.
for observation in 1 2 3; do
  scripts/verify-container-release.sh "$release_sha"
  if [[ "$observation" != "3" ]]; then sleep 10; fi
done

APP_URL="https://coop-boss-access.sociobot.in" \
  RATE_LIMIT_SCOPE=pageview \
  npm run test:rate-limit

WS_URL="wss://coop-boss-access.sociobot.in/ws" \
  npm run test:join-reliability

APP_URL="https://coop-boss-access.sociobot.in" \
  BROWSER_JOIN_ATTEMPTS="${BROWSER_JOIN_ATTEMPTS:-20}" \
  npm run test:browser-joins

echo "Deployed $release_sha as $image with one stable replica; the live page-view limit, 20 protocol joins, and 20 isolated browser joins passed."
