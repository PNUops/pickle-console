#!/usr/bin/env bash
# Full verification gate: lint + typecheck + test + build + dependency audit.
# Run before every commit batch.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run --silent lint
npm run --silent typecheck
npm run --silent test >/dev/null
npm run --silent build >/dev/null

# Security gate: runtime (production) dependencies must be free of
# high-or-worse advisories — a hit fails the verify run.
echo "--- npm audit gate (runtime deps, high+) ---"
npm audit --omit=dev --audit-level=high

# Informational full-tree audit (dev deps included). Mirrors api verify.sh's
# "hard gate + informational report" shape; never fails the run.
echo "--- npm audit report (informational, all deps) ---"
npm audit || true


echo "console verify OK"
