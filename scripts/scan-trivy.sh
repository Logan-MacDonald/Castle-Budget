#!/usr/bin/env bash
# Trivy security scan — filesystem + built container images.
# Uses the official Trivy docker image so no host install is needed.
#
# Each target is scanned twice:
#   1) informational pass at HIGH,CRITICAL,MEDIUM,LOW (visibility, no gate)
#   2) gating pass at HIGH,CRITICAL (--exit-code 1)
# This matches the merge bar (0 critical / 0 high) without losing
# medium/low visibility for triage.
#
# Usage: ./scripts/scan-trivy.sh
#
# Exit codes:
#   0   no HIGH/CRITICAL findings (MEDIUM/LOW may be present)
#   1   HIGH/CRITICAL findings
#   2   tool error (e.g. docker not available)

set -uo pipefail

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

# Skip node_modules for misconfig scanning — third-party packages (e.g.,
# bcrypt) ship their own Dockerfiles that would otherwise pollute results.
# Vuln scanning still runs against package-lock.json at root.
SKIP_DIRS=(--skip-dirs node_modules --skip-dirs "packages/*/node_modules")

rc=0

echo "=== Trivy: filesystem scan — full report (HIGH..LOW) ==="
"${TRIVY_RUN[@]}" fs \
  --scanners vuln,secret,misconfig \
  --ignorefile /src/.trivyignore \
  --severity HIGH,CRITICAL,MEDIUM,LOW \
  "${SKIP_DIRS[@]}" \
  --exit-code 0 \
  /src || true

echo
echo "=== Trivy: filesystem scan — gate (HIGH/CRITICAL) ==="
"${TRIVY_RUN[@]}" fs \
  --scanners vuln,secret,misconfig \
  --ignorefile /src/.trivyignore \
  --severity HIGH,CRITICAL \
  "${SKIP_DIRS[@]}" \
  --exit-code 1 \
  /src || rc=1

# Scan built images if present — use docker.sock so trivy can inspect
# images in the host daemon. Mounting docker.sock increases scan privilege,
# but trivy is read-only.
API_IMAGE_ID=$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^castle-budget-api:' | head -1 || true)
WEB_IMAGE_ID=$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^castle-budget-web:' | head -1 || true)

scan_image() {
  local img="$1"
  echo
  echo "=== Trivy: image scan ${img} — full report ==="
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$TRIVY_CACHE":/root/.cache/ \
    -v "$REPO_ROOT":/src:ro \
    "$TRIVY_IMAGE" image \
      --ignorefile /src/.trivyignore \
      --severity HIGH,CRITICAL,MEDIUM,LOW \
      --exit-code 0 \
      "$img" || true

  echo
  echo "=== Trivy: image scan ${img} — gate (HIGH/CRITICAL) ==="
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$TRIVY_CACHE":/root/.cache/ \
    -v "$REPO_ROOT":/src:ro \
    "$TRIVY_IMAGE" image \
      --ignorefile /src/.trivyignore \
      --severity HIGH,CRITICAL \
      --exit-code 1 \
      "$img" || rc=1
}

if [[ -n "${API_IMAGE_ID}" ]]; then
  scan_image "$API_IMAGE_ID"
else
  echo
  echo "(skipping api image scan — castle-budget-api not built locally)"
fi

if [[ -n "${WEB_IMAGE_ID}" ]]; then
  scan_image "$WEB_IMAGE_ID"
else
  echo "(skipping web image scan — castle-budget-web not built locally)"
fi

echo
if [[ $rc -eq 0 ]]; then
  echo "Trivy: no HIGH/CRITICAL ✓ (MEDIUM/LOW may exist — see full report above)"
else
  echo "Trivy: HIGH/CRITICAL findings present — review output above or consult .trivyignore"
fi

exit $rc
