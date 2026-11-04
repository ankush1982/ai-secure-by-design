---
description: Profile this project, ask which compliance regimes apply, classify data, and write privacy-security-manifest.yaml. Run this first.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent]
---

You are the entry point for the Secure & Private by Design plugin. The user has just installed the plugin and is invoking it for the first time on their project.

## Your job

Run the **profiler subagent** to scan the repo, then conduct an interactive 3-step interview with the user, then write `privacy-security-manifest.yaml` at the project root.

The engine does the deterministic part, so the result is the same with or without an assistant. `sbd init --non-interactive` writes a draft with `TODO(user):` markers from the detected stack and candidate fields. `sbd_plan_init` returns that draft without writing it. You add what only the user can decide: regimes, classification, AI systems.

## Steps

### 1. Run the profiler

Invoke the `profiler` subagent with this prompt:

> Scan the current working directory. Report:
> - Detected languages and frameworks (from package.json / requirements.txt / go.mod / etc.)
> - Database / ORM in use (Prisma, SQLAlchemy, raw SQL, etc.)
> - AI SDKs imported (openai, @anthropic-ai/sdk, langchain, llamaindex, etc.)
> - Auth library (passport, next-auth, authlib, casbin, etc.)
> - Cloud / deployment markers (Dockerfile, terraform/, k8s/, .github/workflows/)
> - Schema fields that LOOK like personal data (name, email, phone, address, DOB, govt-ID, health-related). Report column/field names + table/model + confidence (low/med/high). Do NOT auto-classify — just surface candidates for the user.
> - Return a JSON object with all the above.

### 2. Three-step interview with the user

Use **AskUserQuestion** (or plain prose if unavailable) for each:

**Q1 — Product description.** "What does this product do? (one or two sentences — needed for the manifest)"

**Q2 — Regimes.** Show the supported list and ask which apply. Default: NIST SSDF (always on).
- NIST SSDF 1.1 — secure SDLC baseline (recommended for everyone)
- ISO 27001:2022 — information security management
- DPDP Act 2023 (India) — Digital Personal Data Protection
- AI Security Wiki — community AI control library plus AI-specific checks (model output, model loading, MCP servers, agent permissions). Suggest it if AI SDKs or an MCP configuration were detected. It is a reference, not a law.

**Q3 — Deployment region.** "Where will this product operate? [India / EU / US / Global]" — drives DPDP §16 cross-border-transfer defaults.

### 3. PII classification walkthrough

For each candidate field the profiler surfaced, ask the user to classify:
- `not-personal` — not subject to the manifest
- `personal` — DPDP §2(t) personal data
- `sensitive-personal` — health, financial, biometric, genetic, caste, religious, sexual orientation, etc. (DPDP doesn't formally tier "sensitive" but several other regimes do — surface it as a category for downstream scaffolds)
- `children` — data of users under 18 (DPDP §9 — verifiable parental consent required)

For a **healthcare / doctor-AI** product, default-suggest `sensitive-personal` for any field involving clinical data, and ask "Could any users be under 18?" to set `childrenDataPossible: true` at the category level.

### 4. AI systems

If AI SDKs were detected, ask:
- "Briefly describe what each AI system does."
- "Risk level: [low / medium / high]" (high = affects medical, financial, legal, or safety outcomes)
- "Decision autonomy: [advisory / semi-autonomous / autonomous]" (doctor-AI defaults to advisory)
- "Human oversight requirement: [none / review-recommended / review-mandatory]" (doctor-AI defaults to mandatory)

### 5. Write the manifest

Call `sbd_plan_init` with the regimes the user picked as `regimes`. If the MCP tools are unavailable, run `node "${CLAUDE_PLUGIN_ROOT}/dist/sbd.mjs" init --non-interactive --dry-run --format json --regime <id> ...`. Start from its `draft` and fill in the collected values, following `templates/privacy-security-manifest.example.yaml`. Leave the `TODO(user):` comments where the user must still confirm something.

Use Write, not Edit — this is a new file. If the plan's `action` is `skip`, a manifest already exists: ask the user before overwriting. The CLI never overwrites one.

### 6. Print next steps

```
✓ Manifest written: ./privacy-security-manifest.yaml

Next:
  1. Open the manifest and review the TODO(user): markers.
  2. Run /sbd-deploy to drop the scaffolds into your repo.
  3. Run /sbd-check anytime to verify the manifest is still in sync.

Selected regimes: <list>
Detected stack:   <stack>
Data categories:  <count> classified

Reminder: this plugin scaffolds controls. It does not constitute legal compliance.
See LEGAL-DISCLAIMER.md.
```

## Honest defaults

- If unsure, ask. Do not auto-classify a field as personal/sensitive/children's.
- If a candidate field looks ambiguous (e.g. `notes` column), surface it but mark `confidence: low`.
- Never write a regime to the manifest the user didn't pick.
- Default `significantDataFiduciary` to `null` (unknown) — explain DPDP §10 criteria and let the user decide.
