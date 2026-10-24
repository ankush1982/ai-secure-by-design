#!/usr/bin/env bash
# secure-by-design commit-msg hook (installed into USER's repo by /sbd-deploy).
# Requires an authorship-provenance tag in every commit message.
# Maps to: NIST SSDF PS.3 (software provenance), ISO 27001 A.5.34, audit trail.

set -uo pipefail

MSG_FILE="${1:-}"
[ -z "$MSG_FILE" ] && exit 0
[ ! -f "$MSG_FILE" ] && exit 0

MSG=$(cat "$MSG_FILE")

# Accepted tags (mirror what Immunpilot uses, generalized for any team).
TAGS='\[(human|ai-human-pair|ai:[a-z0-9._-]+)\]'
TRAILER='^AI-Assistance:[[:space:]]*[^[:space:]]'

if ! printf '%s\n' "$MSG" | grep -v '^#' | grep -qE -e "$TAGS" -e "$TRAILER"; then
  cat <<EOF >&2

[secure-by-design] commit blocked — missing authorship provenance tag.

Append exactly one of these to your commit message header:
  [human]
  [ai-human-pair]
  [ai:<model-id>]     (e.g. [ai:claude-opus-4-7], [ai:gpt-5], [ai:gemini-2.5])
or add an "AI-Assistance: <tool>" trailer.

Why: software provenance is a NIST SSDF PS.3 control. For an AI-assisted codebase
under DPDP / ISO 27001, recording who/what authored each change is part of the
accountability story.

EOF
  exit 1
fi

# Optional length check — keep headers reviewable.
HEADER=$(head -n1 "$MSG_FILE")
if [ "${#HEADER}" -gt 100 ]; then
  echo "[secure-by-design] commit header is ${#HEADER} chars (> 100). Shorten for readability." >&2
  exit 1
fi

exit 0
