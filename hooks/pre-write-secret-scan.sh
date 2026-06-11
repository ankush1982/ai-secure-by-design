#!/usr/bin/env bash
# secure-by-design PreToolUse hook.
# Blocks Write/Edit calls that introduce hardcoded secrets.
# Maps to: NIST SSDF PS.1.1, ISO 27001 A.5.34 / A.8.24.
#
# Claude Code passes the tool input via $CLAUDE_TOOL_INPUT (JSON). We extract
# the candidate file content and grep for high-confidence secret patterns.

set -uo pipefail

INPUT="${CLAUDE_TOOL_INPUT:-}"
if [ -z "$INPUT" ]; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | jq -r '.content // .new_string // empty' 2>/dev/null)
[ -z "$CONTENT" ] && exit 0

PATTERNS=(
  'AKIA[0-9A-Z]{16}'                       # AWS Access Key ID
  '(?i)aws_secret_access_key\s*=\s*["'"'"'][A-Za-z0-9/+=]{40}["'"'"']'
  '-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----'
  '(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*["'"'"'][A-Za-z0-9+/=_-]{24,}["'"'"']'
  'sk-[A-Za-z0-9]{32,}'                    # OpenAI-style keys
  'xox[baprs]-[A-Za-z0-9-]{10,}'           # Slack tokens
  'ghp_[A-Za-z0-9]{36}'                    # GitHub personal access tokens
  'AIza[0-9A-Za-z_-]{35}'                  # Google API keys
)

FOUND=""
for p in "${PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -P "$p" > /dev/null 2>&1; then
    FOUND="$FOUND  - $p\n"
  fi
done

if [ -n "$FOUND" ]; then
  cat <<EOF >&2
[secure-by-design] BLOCKED: hardcoded secret pattern detected in proposed Write/Edit.
Patterns matched:
$(echo -e "$FOUND")
Move secrets to env vars or a secret manager (AWS Secrets Manager / Vault / Doppler).
Reference: NIST SSDF PS.1.1, ISO 27001 A.5.34 / A.8.24.
EOF
  exit 2
fi

exit 0
