#!/usr/bin/env bash
# secure-by-design pre-commit hook (installed into USER's repo by /sbd-deploy).
# Scans the staged diff for secrets before allowing commit.
# Maps to: NIST SSDF PS.1.1.

set -uo pipefail

# Preferred path: the sbd engine, so git hooks, agent hooks and CI share one rule set.
if command -v sbd >/dev/null 2>&1; then
  exec sbd scan --staged --fail-on high
fi

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0

PATTERNS=(
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY'
  '(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*["'"'"'][A-Za-z0-9+/=_-]{24,}["'"'"']'
  'sk-[A-Za-z0-9]{32,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'ghp_[A-Za-z0-9]{36}'
  'AIza[0-9A-Za-z_-]{35}'
)

FAILED=0
for FILE in $STAGED; do
  [ ! -f "$FILE" ] && continue
  # Skip lockfiles, snapshot tests, fixtures that legitimately hold sample tokens.
  case "$FILE" in
    package-lock.json|pnpm-lock.yaml|yarn.lock|poetry.lock|Cargo.lock) continue ;;
    *.snap|*/fixtures/*|*/__snapshots__/*) continue ;;
  esac
  for p in "${PATTERNS[@]}"; do
    if git diff --cached "$FILE" | grep -qP -e "^\+.*$p" 2>/dev/null; then
      echo "[secure-by-design] secret pattern in $FILE: $p" >&2
      FAILED=1
    fi
  done
done

if [ "$FAILED" = "1" ]; then
  cat <<'EOF' >&2

Commit blocked. Move secrets to env vars or a secret manager.
Override (NOT recommended): SBD_ALLOW_SECRETS=1 git commit ...
EOF
  if [ "${SBD_ALLOW_SECRETS:-0}" = "1" ]; then
    echo "[secure-by-design] override accepted via SBD_ALLOW_SECRETS=1." >&2
    exit 0
  fi
  exit 1
fi

exit 0
