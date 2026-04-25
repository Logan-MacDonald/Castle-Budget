#!/usr/bin/env bash
# KICS (Keeping Infrastructure as Code Secure) scan.
# Uses the official checkmarx/kics docker image. Scans Dockerfiles,
# docker-compose.yml, GitHub Actions, nginx config, etc.
#
# Usage: ./scripts/scan-kics.sh
#
# Exit codes:
#   0   no HIGH/CRITICAL findings (LOW/MEDIUM may be present)
#   1   HIGH/CRITICAL findings
#   2   tool error

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found on PATH" >&2
  exit 2
fi

OUT_DIR="$REPO_ROOT/.kics-results"
mkdir -p "$OUT_DIR"

KICS_IMAGE="checkmarx/kics:latest"

# Excluded query IDs — see docs/superpowers/specs/2026-04-25-security-accepts.md
# for the rationale behind each entry. Format is comma-separated on the
# command line.
EXCLUDED_QUERIES=(
  "1c1325ff-831d-43a1-973e-839ae57dfcc0"  # Volume Has Sensitive Host Directory (tailscale needs /dev/net/tun)
  "ce76b7d0-9e77-464d-b86f-c5c48e03e22d"  # Container Capabilities Unrestricted (postgres/nginx/tailscale need minimal cap_add)
  "451d79dc-0588-476a-ad03-3c7f0320abb3"  # Container Traffic Not Bound To Host Interface (LAN+tailnet intentional)
  "bc2908f3-f73c-40a9-8793-c1b7d5544f79"  # Privileged Ports Mapped In Container (port 80 = LAN HTTP)
  "d3499f6d-1651-41bb-a9a7-de925fea487b"  # Unpinned Package Version in Apk Add (alpine package pinning is over-cautious)
  "aa93e17f-b6db-4162-9334-c70334e7ac28"  # Chown Flag Exists (--chown is docker-recommended)
  "555ab8f9-2001-455e-a077-f2d0f41e2fb9"  # Unpinned Actions Full Length Commit SHA (tag pins from known publishers)
  "8c978947-0ff6-485c-b0c2-0bfca6026466"  # Shared Volumes Between Containers (single-mount pg_data)
)
EXCLUDED_QUERIES_CSV=$(IFS=, ; echo "${EXCLUDED_QUERIES[*]}")

echo "=== KICS: IaC scan (Dockerfile, docker-compose, nginx, workflows) ==="

# KICS writes reports into the mounted output dir. --no-progress keeps
# console output tight; --report-formats json lets us parse counts below.
docker run --rm \
  -v "$REPO_ROOT":/path:ro \
  -v "$OUT_DIR":/output \
  "$KICS_IMAGE" scan \
    --path /path \
    --output-path /output \
    --report-formats json \
    --exclude-paths "/path/node_modules,/path/packages/*/node_modules,/path/.kics-results" \
    --exclude-queries "$EXCLUDED_QUERIES_CSV" \
    --no-progress \
    --no-color || true   # KICS exits non-zero if ANY finding; we classify below

# Parse severity counts from the JSON report
if [[ ! -f "$OUT_DIR/results.json" ]]; then
  echo "error: KICS did not produce results.json" >&2
  exit 2
fi

# Summary counts via jq if available, else raw grep fallback
if command -v jq >/dev/null 2>&1; then
  echo
  echo "--- severity counts ---"
  jq -r '.severity_counters | to_entries[] | "\(.key): \(.value)"' "$OUT_DIR/results.json"
  HIGH=$(jq -r '.severity_counters.HIGH // 0' "$OUT_DIR/results.json")
  CRITICAL=$(jq -r '.severity_counters.CRITICAL // 0' "$OUT_DIR/results.json")
else
  echo "(jq not installed — install for detailed summary; showing raw JSON summary keys)"
  grep -o '"severity_counters":{[^}]*}' "$OUT_DIR/results.json" || true
  HIGH=$(grep -o '"HIGH":[0-9]*' "$OUT_DIR/results.json" | head -1 | cut -d: -f2 || echo 0)
  CRITICAL=$(grep -o '"CRITICAL":[0-9]*' "$OUT_DIR/results.json" | head -1 | cut -d: -f2 || echo 0)
fi

echo
echo "Full report: $OUT_DIR/results.json"

if [[ "${HIGH:-0}" -gt 0 || "${CRITICAL:-0}" -gt 0 ]]; then
  echo "KICS: HIGH/CRITICAL findings present — review $OUT_DIR/results.json"
  exit 1
fi
echo "KICS: no HIGH/CRITICAL ✓ (MEDIUM/LOW may still exist — see report)"
exit 0
