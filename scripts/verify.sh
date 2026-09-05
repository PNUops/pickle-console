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
#
# `npm audit` answers "we found a high advisory" and "the advisory endpoint
# never replied" with the same nonzero exit, and those are opposite facts. The
# gate therefore decides on the report rather than the exit code, and retries
# only the second. An audit that never answers still fails: a gate that passes
# on "we do not know" is not a gate, it is `|| true` with extra steps.
#
# The endpoint failed twice on 2026-09-04, each attempt burning npm's default
# 300s fetch-timeout, so the wait is capped here instead — three bounded tries
# cost less than one unbounded one and survive a single blip.
echo "--- npm audit gate (runtime deps, high+) ---"
audit_verdict=unknown
for audit_attempt in 1 2 3; do
    set +e
    audit_report=$(npm audit --omit=dev --json --fetch-timeout=60000 2>/dev/null)
    set -e
    audit_verdict=$(printf '%s' "$audit_report" | node -e '
let raw = ""
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  let report
  try {
    report = JSON.parse(raw)
  } catch {
    console.log("unknown")
    return
  }
  const counts = report && report.metadata && report.metadata.vulnerabilities
  if (!counts) {
    console.log("unknown")
    return
  }
  const blocking = (counts.critical || 0) + (counts.high || 0)
  console.log(blocking > 0 ? "found " + blocking : "clean")
})')
    [ "$audit_verdict" = unknown ] || break
    echo "    the advisory endpoint did not answer (attempt $audit_attempt of 3)"
done

case "$audit_verdict" in
    clean)
        echo "    no high-or-worse advisory in runtime dependencies"
        ;;
    unknown)
        echo "npm audit never reached the advisory endpoint." >&2
        echo "The runtime tree is unaudited, which is not the same as clean." >&2
        exit 1
        ;;
    *)
        echo "runtime dependencies carry ${audit_verdict#found } high-or-worse advisories:" >&2
        npm audit --omit=dev --audit-level=high || true
        exit 1
        ;;
esac

# Informational full-tree audit (dev deps included). Mirrors api verify.sh's
# "hard gate + informational report" shape; never fails the run.
echo "--- npm audit report (informational, all deps) ---"
npm audit || true


echo "console verify OK"
