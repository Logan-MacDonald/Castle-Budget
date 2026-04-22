#!/usr/bin/env bash
# Trivy security scan — filesystem + built container images.
# Uses the official Trivy docker image so no host install is needed.
#
# Usage: ./scripts/scan-trivy.sh
#
# Exit codes:
#   0   no vulnerabilities of severity HIGH/CRITICAL
#   1   HIGH/CRITICAL found
#   2   tool error (e.g. docker not available)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found on PATH" >&2
  exit 2
fi

# Cache trivy's vuln DB between runs to avoid re-downloading.
TRIVY_CACHE="${TRIVY_CACHE:-$HOME/.cache/trivy}"
mkdir -p "$TRIVY_CACHE"

TRIVY_IMAGE="aquasec/trivy:latest"
TRIVY_RUN=(docker run --rm
  -v "$REPO_ROOT":/src:ro
  -v "$TRIVY_CACHE":/root/.cache/
  "$TRIVY_IMAGE")

# Optional: build images first if they're not already built locally.
# We don't force a build — caller can `docker compose build` if they want
# fresh image scans.

rc=0

echo "=== Trivy: filesystem scan (npm deps, secrets, config) ==="
"${TRIVY_RUN[@]}" fs \
  --scanners vuln,secret,misconfig \
  --ignorefile /src/.trivyignore \
  --severity HIGH,CRITICAL,MEDIUM,LOW \
  --exit-code 1 \
  --ignore-unfixed=false \
  /src || rc=1

# Scan built images if present — use docker.sock so trivy can inspect
# images in the host daemon. Mounting docker.sock increases scan privilege,
# but trivy is read-only. We mount with :ro intent via -v.
API_IMAGE_ID=$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^castle-budget-api:' | head -1 || true)
WEB_IMAGE_ID=$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^castle-budget-web:' | head -1 || true)

if [[ -n "${API_IMAGE_ID}" ]]; then
  echo "=== Trivy: image scan ${API_IMAGE_ID} ==="
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$TRIVY_CACHE":/root/.cache/ \
    -v "$REPO_ROOT":/src:ro \
    "$TRIVY_IMAGE" image \
      --ignorefile /src/.trivyignore \
      --severity HIGH,CRITICAL,MEDIUM,LOW \
      --exit-code 1 \
      "$API_IMAGE_ID" || rc=1
else
  echo "(skipping api image scan — castle-budget-api not built locally)"
fi

if [[ -n "${WEB_IMAGE_ID}" ]]; then
  echo "=== Trivy: image scan ${WEB_IMAGE_ID} ==="
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$TRIVY_CACHE":/root/.cache/ \
    -v "$REPO_ROOT":/src:ro \
    "$TRIVY_IMAGE" image \
      --ignorefile /src/.trivyignore \
      --severity HIGH,CRITICAL,MEDIUM,LOW \
      --exit-code 1 \
      "$WEB_IMAGE_ID" || rc=1
else
  echo "(skipping web image scan — castle-budget-web not built locally)"
fi

echo
if [[ $rc -eq 0 ]]; then
  echo "Trivy: clean ✓"
else
  echo "Trivy: findings present — review output above or consult .trivyignore"
fi

exit $rc
