#!/usr/bin/env bash
set -euo pipefail

release_sha="${1:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <40-character git SHA>" >&2
  exit 2
fi

resource_group="${COOP_AZURE_RESOURCE_GROUP:-sociobot}"
registry="${COOP_ACR_NAME:-sociobotregistry}"
container_app="${COOP_CONTAINER_APP:-sf-coop-boss-access}"
image_repository="${COOP_IMAGE_REPOSITORY:-sf-coop-boss-access}"
public_origin="${COOP_PUBLIC_ORIGIN:-https://coop-boss-access.sociobot.in}"
expected_image="${registry}.azurecr.io/${image_repository}:${release_sha:0:12}"
state_dir="$(mktemp -d)"
trap 'rm -r -- "$state_dir"' EXIT

az containerapp show \
  --resource-group "$resource_group" \
  --name "$container_app" \
  --output json > "$state_dir/app.json"
az containerapp replica list \
  --resource-group "$resource_group" \
  --name "$container_app" \
  --output json > "$state_dir/replicas.json"
curl --fail --silent --show-error "$public_origin/health" > "$state_dir/health.json"

node scripts/check-deployment-state.mjs \
  "$state_dir/app.json" \
  "$state_dir/replicas.json" \
  "$state_dir/health.json" \
  "$release_sha" \
  "$expected_image"
