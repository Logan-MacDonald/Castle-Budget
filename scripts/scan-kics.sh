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

echo "=== KICS: IaC scan (Dockerfile, docker-compose, nginx, workflows) ==="

# KICS writes reports into the mounted output dir. --no-progress keeps
# console output tight; --report-formats json lets us parse counts below.
# We scan the whole repo; path-include could narrow it.
docker run --rm \
  -v "$REPO_ROOT":/path:ro \
  -v "$OUT_DIR":/output \
  "$KICS_IMAGE" scan \
    --path /path \
    --output-path /output \
    --report-formats json \
    --exclude-paths "/path/node_modules,/path/packages/*/node_modules,/path/.kics-results" \
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
