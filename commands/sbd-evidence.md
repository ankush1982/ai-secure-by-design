---
description: Build an audit evidence plan from the AI Security Wiki controls and this project's check results.
allowed-tools: [Read, Glob, Bash]
---

You are preparing an audit evidence plan. Read-only: do not change code or the manifest.

1. Call the `sbd_evidence_plan` MCP tool. If it is unavailable, run `node "${CLAUDE_PLUGIN_ROOT}/dist/sbd.mjs" evidence --format json`. If the user asked for one tier, pass `tier`.
2. Report the summary: how many controls are `gap`, `checked` and `manual`.
3. List every `gap` control with its open findings as `file:line` and its owner.
4. For `manual` controls, group by owner and say what evidence each owner must collect. Use the plan's `evidence` and `auditTest` fields as they are; do not rewrite them or add control IDs of your own.
5. Offer the outputs: `sbd evidence --format markdown --output evidence-plan.md` for the team, and `--format csv` for the Controls sheet of the wiki's AI Security Audit and Evidence Checklist workbook. Write a file only if the user asks.

If `wikiRegimeSelected` is false, say the AI-specific AIW-* rules did not run, and that adding `- id: ai-security-wiki` under `regimes:` turns them on. Do not add it yourself.

`checked` means the automated checks found nothing; it does not show that a control works. Never say the project is compliant, and leave the workbook's Result column for a reviewer.
