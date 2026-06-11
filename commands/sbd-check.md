---
description: Verify the privacy-security-manifest.yaml is in sync with the codebase. Reports gaps and drift.
allowed-tools: [Read, Glob, Grep, Bash, Agent]
---

You are auditing the manifest against the actual code. Read-only — propose fixes but do not apply them.

## What to check

### 1. Manifest exists and parses

If `privacy-security-manifest.yaml` is missing or invalid, stop and tell the user to run `/sbd-init`.

### 2. Field coverage — did the user classify everything personal?

For each schema source (Prisma `schema.prisma`, SQLAlchemy models, Drizzle schema, raw SQL migrations, Pydantic models, TypeScript interfaces marked as DB models):

- Extract column/field names.
- Compare against `dataCategories[].fields`.
- **Unclassified candidates** = fields that match common personal-data patterns (regex on names like `email`, `phone`, `address`, `dob`, `aadhaar`, `pan`, `name`, `gender`, `passport`, `health`, `medical`, `diagnosis`, `prescription`, `lab`) BUT are not in any dataCategory.

Report each as: `<table>.<field> — looks personal/sensitive — please classify in manifest`.

### 3. Scaffold coverage — are the required scaffolds present?

Cross-reference manifest regimes against `src/privacy/`, `src/security/`, `src/ai/`:

- DPDP regime + at least one personal dataCategory → require `consent.ts`, `dsr-handler.ts`, `retention-runner.ts`
- DPDP regime + `childrenDataPossible: true` anywhere → require `children-gate.ts`
- DPDP regime + any sensitive dataCategory → require `breach-notifier.ts`
- ISO 27001 → require `rbac.ts`, `audit-log.ts`, `security-headers.ts`
- Any `aiSystems` → require `decision-log.ts`
- Any aiSystem with `humanOversight != none` → require `human-oversight.ts`

Missing scaffolds report: `Missing: <path> for <regime> <clause>. Run /sbd-deploy or /sbd-add <name>.`

### 4. Audit-log usage — are mutations logged?

Grep for routes/handlers that mutate data (POST, PUT, PATCH, DELETE handlers in Express/FastAPI/Next.js). For each, check whether the handler body calls `auditLog(...)` (or the equivalent from `src/security/audit-log.ts`).

Report unlogged mutations as: `<file>:<line> — <handler> mutates data without auditLog() call (ISO 27001 A.8.15 / DPDP §8).`

### 5. PII-in-logs — any raw user-object logging?

Grep for: `console.log(`, `logger.info(`, `print(` followed (within 5 lines / by AST) by an identifier that the manifest marks as personal/sensitive.

Report as: `<file>:<line> — logs personal/sensitive field <name> without redaction. Route through src/security/audit-log.ts.`

### 6. AI inference paths — decision logged + oversight gated?

Grep for AI SDK calls: `openai.chat.completions.create`, `anthropic.messages.create`, `client.generate(`, etc. For each, check whether the result flows into `decisionLog(...)` (and `humanOversight(...)` if required).

Report unlogged AI calls as: `<file>:<line> — AI inference without decision-log call (ISO 42001 §8.4-aligned).`

### 7. Retention policy — does every dataCategory have one?

Every category with `consentRequired: true` must have `retentionDays` set. Report any missing as a manifest gap.

## Output format

```
secure-by-design check report
=============================
Manifest: ./privacy-security-manifest.yaml (schemaVersion 0.1)
Regimes:  NIST SSDF 1.1, ISO 27001:2022, DPDP 2023
Stack:    typescript-express

✓  Field classification:    12/12 candidates classified
✗  Scaffold coverage:        9/10 (missing src/privacy/children-gate.ts)
✗  Audit-log coverage:       4 mutations without auditLog()
✓  PII-in-logs:              none detected
✗  AI inference logging:     2 calls without decisionLog()
✓  Retention policies:       all categories have retentionDays

Findings (3):
  1. [HIGH]    Missing: src/privacy/children-gate.ts (DPDP §9)
                → Run /sbd-add children-gate
  2. [MEDIUM]  src/routes/patients.ts:47 — POST /patients mutates without auditLog()
                → Add: auditLog({ actor, action: 'patient.create', target: patientId, manifest })
  3. [MEDIUM]  src/services/diagnose.ts:23 — openai.chat.completions.create without decisionLog()
                → Wrap: const result = await decisionLog('clinical-suggestion-engine', () => openai...)

3 issues — review and fix or run /sbd-add to scaffold what's missing.
```

## Tone

Direct. Each finding is a sentence + a remediation line. No editorializing. No emojis except the ✓/✗ markers.
