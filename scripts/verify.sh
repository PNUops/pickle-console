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

# Publication hygiene: no documentation-repo references, no private-repo or vault
# references, no internal process tokens. Enforced here because two manual scrubs
# both missed real violations.
# shellcheck source=scripts/hygiene.sh
. scripts/hygiene.sh   # cwd is the repo root (set above)
hygiene_check public

echo "console verify OK"
