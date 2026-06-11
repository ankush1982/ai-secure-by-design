# Secure & Private by Design

A Claude Code plugin that bundles **dev-loop security controls** (skills, hooks, slash commands, subagents, MCP server) **and product-code scaffolds** (consent management, DSR handlers, audit logging, PHI redaction, AI decision logs, RBAC, etc.) into a single installable unit.

Install once. Tell the plugin what your product does and which regulatory regime(s) you target. It profiles your codebase, asks you to classify your data, and then deploys both the dev-environment controls AND the product-code scaffolds tailored to your stack and regime.

## What it covers (v0.1)

| Regime | Scope |
|---|---|
| **NIST SSDF 1.1** | Secure SDLC baseline — applies to every project |
| **ISO 27001:2022** | Annex A controls relevant to the dev/SDLC slice (A.5.15, A.5.34, A.8.5, A.8.10–.12, A.8.15, A.8.24–.32) |
| **DPDP Act 2023 (India)** | Notice, consent, data principal rights, retention, breach notification, children's data gate, Significant Data Fiduciary flagging |

| Stack | Status |
|---|---|
| TypeScript + Express | v0.1 ✅ |
| TypeScript + Next.js | v0.1 ✅ (subset) |
| Python + FastAPI | v0.1 ✅ |
| Go, Rust, Java, .NET | v0.2+ |

## Quick start

```bash
# In Claude Code
/plugin install ankush1982/ai-secure-by-design

# Then, in your product repo:
/sbd-init       # profile project, pick regimes, classify data, write manifest
/sbd-deploy     # drop product-code scaffolds + dev-loop hooks into your repo
/sbd-check      # verify manifest is still in sync with the code
```

## What gets deployed

**Dev-loop controls** (live inside Claude Code):
- 4 skills that fire as you write code (privacy-by-design, secure-by-design, dpdp-compliance, healthcare-ai)
- 3 subagents (profiler, scaffold-generator, regime-reviewer)
- 4 slash commands (`/sbd-init`, `/sbd-deploy`, `/sbd-check`, `/sbd-add`)
- Pre-commit hooks: secret scan, PII-in-logs linter, provenance-tag commit-msg gate
- MCP server with tools the AI can call directly

**Product-code scaffolds** (dropped into your repo):
- `src/privacy/consent.ts` — DPDP §6 consent recording + verification
- `src/privacy/dsr-handler.ts` — DPDP §11–14 data principal rights endpoints
- `src/privacy/retention-runner.ts` — DPDP §8(7) retention enforcement
- `src/privacy/breach-notifier.ts` — DPDP §8(6) breach notification stub
- `src/privacy/children-gate.ts` — DPDP §9 verifiable parental consent
- `src/security/rbac.ts` — ISO 27001 A.5.15 / A.8.3 access control scaffold
- `src/security/audit-log.ts` — ISO 27001 A.8.15 logging scaffold
- `src/security/security-headers.ts` — OWASP-aligned defaults
- `src/security/phi-redaction.ts` — healthcare PHI redaction helper
- `src/ai/decision-log.ts` — AI decision logging (ISO 42001-ready)
- `src/ai/human-oversight.ts` — human-in-the-loop gate
- `privacy-security-manifest.yaml` — single source of truth for your data + regimes

All scaffolds:
- Are headered with their regime + clause reference
- Are safe to modify or delete
- Reference `privacy-security-manifest.yaml` for project-specific values
- Are accompanied by docs in `docs/scaffolds/`

## What this is NOT

- **NOT a compliance certification.** Implements common controls; does not constitute legal compliance or legal advice. See [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md).
- **NOT a runtime SaaS.** Everything runs locally inside Claude Code + your repo. No telemetry, no network calls except those the user explicitly initiates.
- **NOT an auditor's evidence collector.** Use Vanta / Drata / Anecdotes for that. This plugin focuses on getting the controls right at design and build time.
- **NOT a substitute for a Data Protection Officer or counsel** for regulated processing (DPDP Significant Data Fiduciary, ISO 27001 audit, HIPAA, etc.).

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Status

v0.1 — pre-release. Tested on synthetic projects; pending real-world validation. Issues and PRs welcome.
