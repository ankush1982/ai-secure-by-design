#!/usr/bin/env bash
# secure-by-design pre-commit hook (installed into USER's repo by /sbd-deploy).
# Catches obvious PII-in-logs anti-patterns in the staged diff.
# Maps to: ISO 27001 A.8.11 (data masking), DPDP §8 (security).

set -uo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|rb)$' || true)
[ -z "$STAGED" ] && exit 0

# Heuristics — pattern: log/print call whose argument list contains a known PII-ish identifier name.
# Tuned conservatively; favors false negatives over false positives.

PII_TOKENS='email|phone|mobile|aadhaar|pan_no|passport|ssn|dob|date_of_birth|address|diagnosis|prescription|lab_result|medical_record|patient|symptom'
LOG_CALLS='console\.(log|info|warn|error|debug)|logger\.(info|warn|error|debug)|print\(|println\(|fmt\.Print'

FAILED=0
for FILE in $STAGED; do
  [ ! -f "$FILE" ] && continue
  # Find added lines (starting with +) that contain BOTH a log call AND a PII token.
  HITS=$(git diff --cached "$FILE" | \
    grep -E "^\+" | \
    grep -E "($LOG_CALLS)" | \
    grep -E -i "($PII_TOKENS)" || true)
  if [ -n "$HITS" ]; then
    echo "[secure-by-design] PII-in-logs candidate in $FILE:" >&2
    echo "$HITS" | sed 's/^/  /' >&2
    echo "  Route through src/security/audit_log.ts which redacts by manifest classification." >&2
    FAILED=1
  fi
done

if [ "$FAILED" = "1" ]; then
  if [ "${SBD_ALLOW_PII_LOG:-0}" = "1" ]; then
    echo "[secure-by-design] override accepted via SBD_ALLOW_PII_LOG=1." >&2
    exit 0
  fi
  echo "Override (review carefully first): SBD_ALLOW_PII_LOG=1 git commit ..." >&2
  exit 1
fi

exit 0
