#!/usr/bin/env bash
# Full verification gate: lint + typecheck + build. Run before every commit batch.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run --silent lint
npm run --silent typecheck
npm run --silent build >/dev/null
echo "console verify OK"
