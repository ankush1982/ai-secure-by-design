---
description: Verify the privacy-security-manifest.yaml is in sync with the codebase. Reports gaps and drift.
allowed-tools: [Bash, Read]
---

You are reporting the results of the deterministic `sbd check` engine. Read-only — propose fixes but do not apply them.

The checks themselves (manifest schema, secrets, unclassified fields, scaffold coverage, audit-log coverage, PII in logs, AI decision logging, retention) are code in `mcp-server/src/core/` driven by `rules/*.yaml`. Do not re-derive them by reading the code yourself: two runs, or two different models, must report the same findings.

## Steps

1. Call the `sbd_check` MCP tool. If it is not available, run:
   `node "${CLAUDE_PLUGIN_ROOT}/dist/sbd.mjs" check --format json`
   This needs Node.js 20 or later.
2. If the result has a SBD-MANIFEST-001 finding (no manifest), tell the user to run `/sbd-init` and stop.
3. Report the findings grouped by severity, with rule ID, `file:line` and the remediation. Do not add, drop or re-rate findings. If you notice something the engine missed, list it separately under "Not checked by the engine (my judgement)".
4. For SBD-FIELD-001 (unclassified field), ask the user how to classify it. Never classify it yourself.
5. End with: "This report lists control gaps. It is not a compliance determination."

## Tone

Direct. Each finding is a sentence + a remediation line. No editorializing.
