<p align="center">
  <a href="https://github.com/ankush1982/ai-secure-by-design">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
      <img alt="Secure &amp; Private by Design" src=".github/assets/logo-light.svg" width="440">
    </picture>
  </a>
</p>

<p align="center">
  <strong>The same security and privacy checks, whichever AI wrote the code.</strong><br>
  A deterministic engine, plus editable scaffolds for consent, audit logs, data rights and AI oversight.
</p>

<p align="center">
  <a href="https://github.com/ankush1982/ai-secure-by-design/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ankush1982/ai-secure-by-design/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-0EA58F"></a>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-20%2B-0EA58F">
  <a href="https://github.com/ankush1982/ai-secure-by-design/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/ankush1982/ai-secure-by-design?color=F7A600"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-it-covers">What it covers</a> ·
  <a href="#what-it-detects">What it detects</a> ·
  <a href="#how-it-works-v02">How it works</a> ·
  <a href="#platform-support">Platforms</a> ·
  <a href="#what-this-is-not">What this is not</a> ·
  <a href="./ROADMAP.md">Roadmap</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

AI coding tools write code quickly and forget rules quietly. Secure & Private by Design moves the rules out of the prompt and into an engine that gives the same answer every time, then runs that engine in your editor, your git hooks and your CI.

Tell it what your product does and which regimes you target. It profiles your codebase, asks you to classify your data, and deploys dev-loop controls (hooks, skills, slash commands, subagents, an MCP server) and product-code scaffolds tailored to your stack.

## Why use it

- **Secrets and personal data get blocked.** Hardcoded keys, Aadhaar numbers, PAN, mobile numbers and emails are stopped in Claude Code, at commit and in CI, and reports never repeat the value.
- **Checks are code, not prompts.** Claude, GPT, Gemini and a human running the CLI all see the same findings, each with a stable rule ID, a severity and a location.
- **Your manifest is the source of truth.** One YAML file records your data categories, regimes, retention and consent. Only the regimes you list are enforced, and the tool never classifies a field for you.
- **You own the scaffolds.** Consent, data rights, audit logging, RBAC, PHI redaction and AI decision logs land in your repo as ordinary code you can edit or delete.
- **Everything runs locally.** No telemetry and no hosted service.

## See it run

`sbd check` on the sample app in `mcp-server/test/fixtures/clinic-app` (trimmed):

```text
Manifest: privacy-security-manifest.yaml (schemaVersion 0.2)
Regimes:  nist-ssdf-1.1, iso-27001-2022, dpdp-2023

  1. [CRITICAL] SBD-SCAF-001 Missing src/privacy/consent.<ext> (Consent scaffold).
       → Copy templates/typescript-express/consent.ts to src/privacy/consent.ts, or run `sbd deploy`.
 10. [HIGH] SBD-FIELD-001 prisma/schema.prisma:5 — Field dateOfBirth looks personal or sensitive but no dataCategory lists it.
 12. [HIGH] SBD-CODE-002 src/routes/patients.ts:19 — Log call references a field the manifest classifies as personal or sensitive.
       console.log('loaded patient', patient.email);
       → Route the value through the redacting logger in src/security/audit_log.
 13. [HIGH] SBD-CODE-003 src/services/triage.ts:6 — Model inference call with no decision-log call within 15 lines.
 16. [MEDIUM] SBD-CODE-001 src/routes/patients.ts:12 — Handler mutates data without an auditLog() call within 40 lines.

17 finding(s): 2 critical, 11 high, 3 medium, 1 low, 0 info.
This report lists control gaps. It is not a compliance determination.
```

## What it covers

| Regime | Scope |
|---|---|
| **NIST SSDF 1.1** | Secure SDLC baseline — applies to every project |
| **ISO 27001:2022** | Annex A controls relevant to the dev/SDLC slice (A.5.15, A.5.34, A.8.5, A.8.10–.12, A.8.15, A.8.24–.32) |
| **DPDP Act 2023 (India)** | Notice, consent, data principal rights, retention, breach notification, children's data gate, Significant Data Fiduciary flagging |
| **AI Security Wiki** (optional) | The community [AI Security Wiki](https://nachi065.github.io/AI-Security-Wiki/) control library (46 AI controls) plus AI-specific checks on model output, model loading, MCP servers and agent permissions. A practitioner reference, not a law. See [AI Security Wiki integration](#ai-security-wiki-integration) |

| Stack | Status |
|---|---|
| TypeScript + Express | v0.1 ✅ (templates in `templates/typescript-express/`) |
| TypeScript + Next.js | Planned (v0.2+). No templates yet. |
| Python + FastAPI | v0.2 ✅ (templates in `templates/python-fastapi/`; needs Python 3.10+ and `fastapi`). `sbd check` also reads Python code and models. |
| Go, Rust, Java, .NET | Later |

## What it detects

`sbd check` looks for three kinds of sensitive data. Rules are patterns over your code and data files, so a clean report does not prove the data is absent.

| Data | Found | Not found |
|---|---|---|
| **Secrets** | AWS, GitHub, Slack, Google and OpenAI-style keys, private keys and credential assignments, with the value masked in reports | Secrets with no known format or assignment |
| **PII** | Aadhaar numbers (with checksum), PAN, Indian mobile numbers and email addresses written into source and data files, with the value hidden in reports. Unclassified personal-looking schema fields. Classified fields, and whole request or user objects, passed to log calls | Names and postal addresses. Personal data in production databases or logs |
| **PHI** | Clinical and health-identifier schema fields such as `diagnosis`, `mrn`, `bloodGroup`, `allergies` and `abhaNumber`, plus any field you classify | Clinical free text in code, such as a sample patient note. Use [`phi_redaction`](#what-gets-deployed) to redact it at runtime |

Any secret or literal PII blocks. Every rule above is `HIGH` or `CRITICAL`, so each one fails at the default `--fail-on high`:

| Where | Blocks on |
|---|---|
| Claude Code editor hook | Secrets and literal PII in a proposed edit, before it is written |
| `sbd-secrets` pre-commit hook (`sbd scan --staged`) | Secrets and literal PII on staged lines, with or without a manifest |
| `sbd-check` pre-commit hook (`sbd check --staged`) | The above, plus schema fields and log calls on staged lines. Needs a manifest |
| GitHub Action (`sbd check`) | All of the above, across the repository or a diff |

Placeholder values such as `@example.com` addresses are skipped, and the secret rules skip lockfiles, snapshots and `fixtures/` folders. To accept reviewed sample data, add `sbd: ignore SBD-PII-001` to the line and record why; it shows up in the diff for review, and secret rules cannot be ignored this way. Setting `--fail-on critical` or `none`, or running `git commit --no-verify`, turns local blocking off, so keep the GitHub Action as a required check. Without Node.js, the fallback hook scripts cover secrets only.

## How it works (v0.2)

The checks that must give the same answer every time are code, not prompts. One engine, thin adapters per platform:

```
 schemas/ + regimes/ + rules/   data, schema-validated
            │
   sbd engine (mcp-server/src/core)   check · scan · validate · plan · explain
   output: text, JSON, SARIF 2.1.0; exit codes 0 / 1 / 2
            │
 ┌──────────┼──────────────┬───────────────┬────────────────────────┐
 MCP server  git hooks      CI action       instruction packs
 stdio+HTTP  (pre-commit)   (action.yml)    CLAUDE.md, AGENTS.md, GEMINI.md,
                                            Copilot, Cursor (one source)
```

An AI assistant explains findings and proposes fixes. It does not decide what the findings are, so Claude, GPT, Gemini or a human running the CLI all see the same list, and CI enforces it whichever of them wrote the code.

## Quick start

### Any platform: the CLI

```bash
git clone https://github.com/ankush1982/ai-secure-by-design
cd /path/to/your/repo
node /path/to/ai-secure-by-design/dist/sbd.mjs check
```

Or add it to a Node project as a dev dependency (`npm i -D github:ankush1982/ai-secure-by-design#v0.2.0`) and run `npx sbd check`. It is not published to the npm registry yet.

To set up a project without an AI assistant, choose your regimes and run:

```bash
sbd init --non-interactive --regime nist-ssdf-1.1,iso-27001-2022   # writes a draft manifest
sbd validate
sbd deploy --dry-run                                               # shows what would change
sbd deploy                                                         # copies the scaffolds
sbd plan                                                           # every scaffold now shows as present
```

The draft never decides for you. It leaves `dataCategories` empty and lists the personal-looking fields as `TODO(user):` comments, because classification is yours. Without `--regime` it leaves `regimes` empty, and `validate`, `plan` and `deploy` stop with a schema error until you add one. Scaffolds that depend on your data, such as consent and DSR handling, are required only once you declare personal data in the manifest.

| Command | What it does |
|---|---|
| `sbd init --non-interactive [--regime ID]... [--stack STACK] [--dry-run]` | Detects the stack and writes a draft `privacy-security-manifest.yaml` with `TODO(user):` markers. Never classifies a field, lists only the regimes you pass, and never overwrites an existing manifest. |
| `sbd deploy [--stack STACK] [--dry-run] [--force]` | Copies the scaffolds the manifest requires, each with its template checksum in the generator header. Safe to re-run: it updates scaffolds you have not touched and leaves edited or user-authored files alone unless you pass `--force`. Exits `1` if a required scaffold could not be deployed, for example because the stack has no template. |
| `sbd check [--diff RANGE \| --staged] [--format text\|json\|sarif] [--output FILE] [--fail-on LEVEL]` | All checks: manifest schema and semantics, secrets, literal personal data, unclassified personal-looking fields, required scaffolds, audit-log coverage, personal data in logs, AI decision logging |
| `sbd scan --staged \| --stdin \| FILE...` | Scans for secrets and literal personal data, with no manifest needed (used by hooks) |
| `sbd validate` | Manifest only |
| `sbd plan [--stack STACK]` | Which scaffolds the manifest needs, where they go, and whether they exist. Writes nothing. The stack comes from `--stack`, then `product.stack`, then detection. |
| `sbd controls [--regime ID]`, `sbd explain REGIME CONTROL` | Query the regime catalogues |
| `sbd evidence [--tier baseline\|advanced] [--format text\|json\|markdown\|csv] [--output FILE]` | Plans audit evidence, showing each control as `gap`, `checked` or `manual` |
| `sbd provenance MSGFILE` | Commit-message provenance check |

Exit codes: `0` no findings at or above `--fail-on` (default `high`), `1` findings, `2` usage or runtime error.

With `--staged` or `--diff`, `sbd check` gates the change: it reports findings on added lines, and manifest findings only if the change touches the manifest. Project-wide gaps such as missing scaffolds appear in a full `sbd check`, which the CI template runs on pushes to the main branch.

Each finding has a stable rule ID (`SBD-SECRET-001`, `SBD-PII-001`, `SBD-CODE-002`, `SBD-SCAF-004`, …), a severity, a location and the regime controls it maps to. Rules live in `rules/*.yaml`; add a rule there and every adapter picks it up.

### Git hooks (any editor, any AI)

Add to your repo's `.pre-commit-config.yaml` ([pre-commit](https://pre-commit.com)):

```yaml
repos:
  - repo: https://github.com/ankush1982/ai-secure-by-design
    rev: v0.2.0   # pin it
    hooks:
      - id: sbd-secrets
      - id: sbd-check
      - id: sbd-provenance
```

Then `pre-commit install --hook-type pre-commit --hook-type commit-msg`.

### CI (GitHub Actions)

Copy `templates/.github/workflows/secure-by-design.yml`. It uses this repo's `action.yml`, uploads SARIF to code scanning and fails the build on findings at or above `fail-on`. Pin the action to a tag or commit SHA.

### MCP server (Claude, ChatGPT, Gemini, Copilot, Cursor, …)

```bash
node /path/to/ai-secure-by-design/dist/sbd-mcp.mjs --root /path/to/your/repo          # stdio (default)
node /path/to/ai-secure-by-design/dist/sbd-mcp.mjs --root /path/to/your/repo --http   # http://127.0.0.1:8765/mcp
```

- **Tools** (all read-only): `sbd_validate_manifest`, `sbd_check`, `sbd_scan_text`, `sbd_review_diff`, `sbd_list_controls`, `sbd_explain_control`, `sbd_plan_scaffold`, `sbd_plan_init`, `sbd_plan_deploy`, `sbd_evidence_plan`. `sbd_plan_init` and `sbd_plan_deploy` return what `sbd init` and `sbd deploy` would do. Only the CLI writes files.
- **Prompts**: `sbd-init`, `sbd-check`, `sbd-deploy` (from `instructions/prompts/`).
- **Resources**: `sbd://regimes/{id}`, `sbd://schemas/{manifest,regime,rules}`, `sbd://manifest`.
- Every path argument is confined to `--root`.
- **HTTP mode** binds to 127.0.0.1 with DNS-rebinding protection. It will not bind to a non-loopback address unless `SBD_HTTP_TOKEN` is set, and then every request needs `Authorization: Bearer <token>`. Set `SBD_ALLOWED_HOSTS` to the public hostname when hosting it. The server reads your source tree, so only expose it deliberately.

### Claude Code plugin

```bash
/plugin marketplace add ankush1982/ai-secure-by-design
/plugin install secure-by-design@ai-secure-by-design
```

The engine ships prebuilt in `dist/`: `dist/sbd.mjs` (CLI), `dist/sbd-mcp.mjs` (MCP server) and their shared code in `dist/chunks/`, so it needs only Node.js 20+ with no `npm install`. If Node is missing, the PreToolUse secret hook falls back to a `grep -E` + `jq` scan. The bundles are rebuilt with `npm run build`, and `npm test` fails if they no longer match the source in `mcp-server/src/`.

Slash commands: `/sbd-init`, `/sbd-deploy`, `/sbd-check` (now reports the engine's results instead of doing the checks in prose), `/sbd-add`, `/sbd-evidence`.

## AI Security Wiki integration

The [AI Security Wiki](https://nachi065.github.io/AI-Security-Wiki/) says what good looks like for AI systems. This engine checks your code against it. Add the wiki to your manifest to turn it on; nothing changes unless you do:

```yaml
regimes:
  - id: ai-security-wiki
```

| What you get | How |
|---|---|
| **AI-specific checks** | `sbd check` runs the wiki's `AIW-*` rules: model output reaching `eval`, a shell, HTML or SQL; unsafe model loading; `trust_remote_code`; unpinned models and MCP servers; remote MCP over HTTP; auto-approved tools; agents run with approvals off |
| **Findings tied to controls** | Every finding is tagged with the `AI-CTRL` IDs it supports, and SARIF links to the control's wiki page |
| **The control library, offline** | `sbd explain ai-security-wiki AI-CTRL-045` gives the objective, evidence, audit test, owner, review frequency and test cases |
| **An audit evidence plan** | `sbd evidence` shows every control as `gap`, `checked` or `manual`. `--format markdown` is for the team; `--format csv` fits the Controls sheet of the wiki's [audit workbook](https://nachi065.github.io/AI-Security-Wiki/25_Templates/05_AI_Security_Audit_and_Evidence_Checklist_Template.html). The MCP tool is `sbd_evidence_plan`; in Claude Code use `/sbd-evidence` |

`checked` only means the automated checks found nothing, so it does not show a control works, and `Result` is left blank for a reviewer. `sbd evidence` also works without the regime, but then the `AIW-*` rules do not run.

To accept one reviewed line of code, add a comment containing `sbd: ignore AIW-004` (or `aiwiki: ignore AIW-004`) and record why. Secret rules cannot be ignored this way.

The data is generated from a wiki checkout with `npm run sync:wiki -- ../AI-Security-Wiki`; the commit it came from is at the top of `regimes/ai-security-wiki.yaml`. The wiki's own [Builder Toolkit](https://nachi065.github.io/AI-Security-Wiki/24_Builder_Track/05_Builder_Toolkit.html) offers the same AI rules in Python, with test case and risk look-ups.

## Platform support

> **Not verified.** The integration points below are from the maintainers' knowledge as of mid-2026 and have **not** been tested on each platform. These features change often; check each vendor's current documentation before relying on them. Only the CLI, the git hooks, the GitHub Action and the MCP server over stdio and HTTP are covered by this repo's tests, using the MCP TypeScript SDK client.

| Platform | Integration | Instruction file (generated) |
|---|---|---|
| Claude Code | Plugin (MCP server + hooks + commands), or MCP server alone | `skills/sbd-project-rules/SKILL.md` |
| OpenAI Codex / agents | MCP server (stdio) | `templates/agent-instructions/AGENTS.md` |
| ChatGPT | Remote MCP server (HTTP mode) as a connector, where the plan allows it | — |
| Gemini CLI | MCP server in its settings | `templates/agent-instructions/GEMINI.md` (or point it at `AGENTS.md`) |
| GitHub Copilot (VS Code) | MCP server in workspace MCP config | `templates/agent-instructions/.github/copilot-instructions.md` |
| Cursor | MCP server in its MCP config | `templates/agent-instructions/.cursor/rules/secure-by-design.mdc` |
| Anything else | CLI + git hooks + CI | — |

Hosted assistants such as ChatGPT cannot run your local git hooks, so enforcement for those users comes from the pre-commit hooks and CI.

The instruction files are generated from `instructions/agent-instructions.md` by `npm run gen:instructions`; `npm test` fails if they drift.

## What gets deployed

**Dev-loop controls**:
- 5 skills that fire as you write code (privacy-by-design, secure-by-design, dpdp-compliance, healthcare-ai, sbd-project-rules)
- 3 subagents (profiler, scaffold-generator, regime-reviewer)
- 5 slash commands (`/sbd-init`, `/sbd-deploy`, `/sbd-check`, `/sbd-add`, `/sbd-evidence`)
- Git hooks via the pre-commit framework: secret and personal data scan, staged-line `sbd check`, provenance-tag commit-msg gate
- MCP server with read-only tools any MCP client can call
- GitHub Action with SARIF upload

**Product-code scaffolds** (dropped into your repo; `.ts` shown, `.py` on `python-fastapi`):
- `src/privacy/consent.ts` — DPDP §6 consent recording + verification
- `src/privacy/dsr_handler.ts` — DPDP §11–14 data principal rights endpoints
- `src/privacy/retention_runner.ts` — DPDP §8(7) retention enforcement
- `src/privacy/breach_notifier.ts` — DPDP §8(6) breach notification stub
- `src/privacy/children_gate.ts` — DPDP §9 verifiable parental consent
- `src/security/rbac.ts` — ISO 27001 A.5.15 / A.8.3 access control scaffold
- `src/security/audit_log.ts` — ISO 27001 A.8.15 logging scaffold
- `src/security/security_headers.ts` — OWASP-aligned defaults
- `src/security/phi_redaction.ts` — healthcare PHI redaction helper
- `src/ai/decision_log.ts` — AI decision logging
- `src/ai/human_oversight.ts` — human-in-the-loop gate
- `privacy-security-manifest.yaml` — single source of truth for your data + regimes

All scaffolds:
- Are headered with their regime + clause reference
- Are safe to modify or delete
- Reference `privacy-security-manifest.yaml` for project-specific values
- Per-scaffold docs in `docs/scaffolds/` are planned but not written yet

## What this is NOT

- **NOT a compliance certification.** Implements common controls; does not constitute legal compliance or legal advice. See [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md).
- **NOT a runtime SaaS.** Everything runs locally against your repo. No telemetry. The MCP server's HTTP mode is opt-in and listens on localhost by default.
- **NOT an auditor's evidence collector.** `sbd evidence` plans what to collect and reports what the checks saw. Collecting and storing evidence is a job for Vanta / Drata / Anecdotes or your own process.
- **NOT a substitute for a Data Protection Officer or counsel** for regulated processing (DPDP Significant Data Fiduciary, ISO 27001 audit, HIPAA, etc.).

## License

Apache-2.0, see [LICENSE](./LICENSE), except `regimes/ai-security-wiki.yaml` and `rules/ai-wiki.yaml`, which are adapted from the AI Security Wiki under CC BY-SA 4.0. See [NOTICE](./NOTICE).

## Status

v0.2.0 is the current release. `npm test` runs the engine, hooks and MCP server against fixture projects with known gaps (`mcp-server/test/`), and type-checks the scaffolds. It needs Python 3.10+ (set `SBD_PYTHON` to choose one) and installs its pinned Python tools into `build/`. Pending real-world validation, and the DPDP scaffolds have not had a legal review. See the [roadmap](./ROADMAP.md).

## Contributing and security

Issues and PRs are welcome: start with [CONTRIBUTING.md](./CONTRIBUTING.md). To report a vulnerability, follow [SECURITY.md](./SECURITY.md) rather than opening a public issue.
