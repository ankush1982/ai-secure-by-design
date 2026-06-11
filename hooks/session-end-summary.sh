#!/usr/bin/env bash
# secure-by-design Stop hook. Runs when a Claude Code session ends.
# Lightweight reminder so regime-relevant changes aren't forgotten before commit.

set -uo pipefail

# Only fire if a manifest is present in the cwd.
[ ! -f "./privacy-security-manifest.yaml" ] && exit 0

CHANGED=$(git diff --name-only 2>/dev/null || true)
[ -z "$CHANGED" ] && exit 0

PRIVACY_TOUCHED=$(echo "$CHANGED" | grep -E '^src/(privacy|security|ai)/' || true)
SCHEMA_TOUCHED=$(echo "$CHANGED" | grep -E '(schema\.prisma|models?\.(py|ts)|migrations?/|.*\.sql)$' || true)
MANIFEST_STALE=""
if [ -n "$SCHEMA_TOUCHED" ] && ! echo "$CHANGED" | grep -q "privacy-security-manifest.yaml"; then
  MANIFEST_STALE="yes"
fi

if [ -n "$PRIVACY_TOUCHED" ] || [ -n "$MANIFEST_STALE" ]; then
  cat <<EOF
─────────────────────────────────────────────────────────
secure-by-design — session-end reminder
─────────────────────────────────────────────────────────
EOF
  [ -n "$PRIVACY_TOUCHED" ] && echo "Touched privacy/security/ai layer files:" && echo "$PRIVACY_TOUCHED" | sed 's/^/  - /'
  [ -n "$MANIFEST_STALE" ] && echo "Schema changes detected but manifest unchanged — run /sbd-check before commit."
  echo ""
  echo "Run: /sbd-check"
  echo "─────────────────────────────────────────────────────────"
fi

exit 0
