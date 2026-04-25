#!/usr/bin/env bash
# Aggregate security scan: runs Trivy + KICS sequentially.
# Both scans always run; exit code reflects the worst result.
#
# Usage: ./scripts/scan-all.sh    (or: npm run scan)
#
# Exit codes:
#   0   both scans clean
#   1   at least one scan found HIGH/CRITICAL
#   2   tool error in at least one scan

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

trivy_rc=0
kics_rc=0

echo "######################################"
echo "# Trivy"
echo "######################################"
./scripts/scan-trivy.sh || trivy_rc=$?

echo
echo "######################################"
echo "# KICS"
echo "######################################"
./scripts/scan-kics.sh || kics_rc=$?

echo
echo "######################################"
echo "# Summary"
echo "######################################"
printf "Trivy: exit %d  %s\n" "$trivy_rc" "$([[ $trivy_rc -eq 0 ]] && echo ✓ || echo ✗)"
printf "KICS:  exit %d  %s\n" "$kics_rc"  "$([[ $kics_rc  -eq 0 ]] && echo ✓ || echo ✗)"

# Tool errors (exit 2) dominate; else any HIGH/CRITICAL (exit 1) fails the run.
if [[ $trivy_rc -eq 2 || $kics_rc -eq 2 ]]; then
  exit 2
fi
if [[ $trivy_rc -ne 0 || $kics_rc -ne 0 ]]; then
  exit 1
fi
exit 0
