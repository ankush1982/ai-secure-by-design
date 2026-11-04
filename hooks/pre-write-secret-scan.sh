#!/usr/bin/env bash
# secure-by-design PreToolUse hook (Claude Code adapter).
# Blocks Write/Edit/MultiEdit calls that introduce hardcoded secrets or literal personal data.
# Maps to: NIST SSDF PS.1.1, ISO 27001 A.5.34 / A.8.24.
#
# Claude Code sends the hook input as JSON on stdin; the tool arguments are under
# .tool_input. Exit code 2 blocks the call and stderr is shown as the reason.
#
# Preferred path: the sbd engine (same rules as git hooks and CI). Fallback: the
# grep patterns below, for machines without Node.js. They cover secrets only.

set -uo pipefail

INPUT=$(cat)
[ -z "$INPUT" ] && exit 0

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
CLI="$ROOT/dist/sbd.mjs"
if command -v node >/dev/null 2>&1 && [ -f "$CLI" ]; then
  printf '%s' "$INPUT" | node "$CLI" hook claude-pretooluse
  exit $?
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[secure-by-design] secret scan skipped: install Node.js 20+ (preferred) or jq." >&2
  exit 0
fi

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input | [.content?, .new_string?, (.edits[]?.new_string)] | map(select(. != null)) | join("\n")' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

# POSIX extended regular expressions only: macOS grep has no -P, and a failing grep looks
# the same as "no match", so a PCRE pattern here silently scans nothing.
PATTERNS=(
  'AKIA[0-9A-Z]{16}'                       # AWS Access Key ID
  '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY'
  'sk-(proj-|ant-)?[A-Za-z0-9_-]{32,}'     # model-provider keys
  'xox[baprs]-[A-Za-z0-9-]{10,}'           # Slack tokens
  '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}'  # GitHub tokens
  'AIza[0-9A-Za-z_-]{35}'                  # Google API keys
)
PATTERNS_ANY_CASE=(
  'aws_secret_access_key[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+=]{40}["'"'"']'
  '(api[_-]?key|secret|password|passwd|token)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9+/=_-]{24,}["'"'"']'
)

FOUND=""
for p in "${PATTERNS[@]}"; do
  # -e: patterns that start with dashes must not be read as grep options (R-D1).
  if printf '%s' "$CONTENT" | grep -qE -e "$p"; then
    FOUND="$FOUND  - $p\n"
  fi
done
for p in "${PATTERNS_ANY_CASE[@]}"; do
  if printf '%s' "$CONTENT" | grep -qEi -e "$p"; then
    FOUND="$FOUND  - $p\n"
  fi
done

if [ -n "$FOUND" ]; then
  printf '[secure-by-design] BLOCKED: hardcoded secret pattern in proposed edit.\nPatterns matched:\n%b\nMove secrets to env vars or a secret manager. NIST SSDF PS.1.1.\n' "$FOUND" >&2
  exit 2
fi

exit 0
