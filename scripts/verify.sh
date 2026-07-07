#!/usr/bin/env bash
# Full verification gate: lint + typecheck + test + build. Run before every commit batch.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run --silent lint
npm run --silent typecheck
npm run --silent test >/dev/null
npm run --silent build >/dev/null
echo "console verify OK"
