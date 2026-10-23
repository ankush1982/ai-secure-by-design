# Secure & Private by Design

A platform-neutral engine, with a Claude Code plugin and adapters for other AI tools, that bundles **dev-loop security controls** (skills, hooks, slash commands, subagents, MCP server) **and product-code scaffolds** (consent management, DSR handlers, audit logging, PHI redaction, AI decision logs, RBAC, etc.) into a single installable unit.

Install once. Tell the plugin what your product does and which regulatory regime(s) you target. It profiles your codebase, asks you to classify your data, and then deploys both the dev-environment controls AND the product-code scaffolds tailored to your stack and regime.

## What it covers

| Regime | Scope |
|---|---|
| **NIST SSDF 1.1** | Secure SDLC baseline — applies to every project |
| **ISO 27001:2022** | Annex A controls relevant to the dev/SDLC slice (A.5.15, A.5.34, A.8.5, A.8.10–.12, A.8.15, A.8.24–.32) |
| **DPDP Act 2023 (India)** | Notice, consent, data principal rights, retention, breach notification, children's data gate, Significant Data Fiduciary flagging |

| Stack | Status |
|---|---|
| TypeScript + Express | v0.1 ✅ (templates in `templates/typescript-express/`) |
| TypeScript + Next.js | Planned (v0.2+). No templates yet. |
| Python + FastAPI | Planned (v0.2+). No templates yet. `sbd check` already reads Python code and models. |
| Go, Rust, Java, .NET | Later |

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
git clone https://github.com/ankush1982/ai-secure-by-design && cd ai-secure-by-design
npm ci            # installs dependencies and builds mcp-server/dist
cd /path/to/your/repo
node /path/to/ai-secure-by-design/mcp-server/dist/cli.js check
```

Or add it to a Node project as a dev dependency (`npm i -D github:ankush1982/ai-secure-by-design#<tag-or-sha>`) and run `npx sbd check`. It is not published to the npm registry yet.

| Command | What it does |
|---|---|
| `sbd check [--diff RANGE \| --staged] [--format text\|json\|sarif] [--output FILE] [--fail-on LEVEL]` | All checks: manifest schema and semantics, secrets, unclassified personal-looking fields, required scaffolds, audit-log coverage, personal data in logs, AI decision logging |
| `sbd scan --staged \| --stdin \| FILE...` | Secret scan only (used by hooks) |
| `sbd validate` | Manifest only |
| `sbd plan [--stack STACK]` | Which scaffolds the manifest needs, where they go, and whether they exist. Writes nothing. |
| `sbd controls [--regime ID]`, `sbd explain REGIME CONTROL` | Query the regime catalogues |
| `sbd provenance MSGFILE` | Commit-message provenance check |

Exit codes: `0` no findings at or above `--fail-on` (default `high`), `1` findings, `2` usage or runtime error.

Each finding has a stable rule ID (`SBD-SECRET-001`, `SBD-CODE-002`, `SBD-SCAF-004`, …), a severity, a location and the regime controls it maps to. Rules live in `rules/*.yaml`; add a rule there and every adapter picks it up.

### Git hooks (any editor, any AI)

Add to your repo's `.pre-commit-config.yaml` ([pre-commit](https://pre-commit.com)):

```yaml
repos:
  - repo: https://github.com/ankush1982/ai-secure-by-design
    rev: <tag or commit SHA>   # pin it
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
node /path/to/ai-secure-by-design/mcp-server/dist/index.js --root /path/to/your/repo          # stdio (default)
node /path/to/ai-secure-by-design/mcp-server/dist/index.js --root /path/to/your/repo --http   # http://127.0.0.1:8765/mcp
```

- **Tools** (all read-only): `sbd_validate_manifest`, `sbd_check`, `sbd_scan_text`, `sbd_review_diff`, `sbd_list_controls`, `sbd_explain_control`, `sbd_plan_scaffold`.
- **Prompts**: `sbd-init`, `sbd-check`, `sbd-deploy` (from `instructions/prompts/`).
- **Resources**: `sbd://regimes/{id}`, `sbd://schemas/{manifest,regime,rules}`, `sbd://manifest`.
- Every path argument is confined to `--root`.
- **HTTP mode** binds to 127.0.0.1 with DNS-rebinding protection. It will not bind to a non-loopback address unless `SBD_HTTP_TOKEN` is set, and then every request needs `Authorization: Bearer <token>`. Set `SBD_ALLOWED_HOSTS` to the public hostname when hosting it. The server reads your source tree, so only expose it deliberately.

### Claude Code plugin

```bash
/plugin install ankush1982/ai-secure-by-design
```

The plugin ships source only, so build the engine once in the plugin's install directory (`npm ci`). Without a build, the MCP server will not start, and the PreToolUse secret hook falls back to a `grep -P` + `jq` scan.

Slash commands: `/sbd-init`, `/sbd-deploy`, `/sbd-check` (now reports the engine's results instead of doing the checks in prose), `/sbd-add`.

## Platform support

> **Not verified.** The integration points below are from the maintainers' knowledge as of mid-2026 and have **not** been tested on each platform. These features change often; check each vendor's current documentation before relying on them. Only the CLI, the git hooks, the GitHub Action and the MCP server over stdio and HTTP are covered by this repo's tests, using the MCP TypeScript SDK client.

| Platform | Integration | Instruction file (generated) |
|---|---|---|
| Claude Code | Plugin (MCP server + hooks + commands), or MCP server alone | `CLAUDE.md` |
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
- 4 skills that fire as you write code (privacy-by-design, secure-by-design, dpdp-compliance, healthcare-ai)
- 3 subagents (profiler, scaffold-generator, regime-reviewer)
- 4 slash commands (`/sbd-init`, `/sbd-deploy`, `/sbd-check`, `/sbd-add`)
- Git hooks via the pre-commit framework: secret scan, staged-line `sbd check`, provenance-tag commit-msg gate
- MCP server with read-only tools any MCP client can call
- GitHub Action with SARIF upload

**Product-code scaffolds** (dropped into your repo):
- `src/privacy/consent.ts` — DPDP §6 consent recording + verification
- `src/privacy/dsr_handler.ts` — DPDP §11–14 data principal rights endpoints
- `src/privacy/retention_runner.ts` — DPDP §8(7) retention enforcement
- `src/privacy/breach_notifier.ts` — DPDP §8(6) breach notification stub
- `src/privacy/children_gate.ts` — DPDP §9 verifiable parental consent
- `src/security/rbac.ts` — ISO 27001 A.5.15 / A.8.3 access control scaffold
- `src/security/audit_log.ts` — ISO 27001 A.8.15 logging scaffold
- `src/security/security_headers.ts` — OWASP-aligned defaults
- `src/security/phi_redaction.ts` — healthcare PHI redaction helper
- `src/ai/decision_log.ts` — AI decision logging (ISO 42001-ready)
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
- **NOT an auditor's evidence collector.** Use Vanta / Drata / Anecdotes for that. This plugin focuses on getting the controls right at design and build time.
- **NOT a substitute for a Data Protection Officer or counsel** for regulated processing (DPDP Significant Data Fiduciary, ISO 27001 audit, HIPAA, etc.).

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Status

v0.2 in development — pre-release. `npm test` runs the engine, hooks and MCP server against fixture projects with known gaps (`mcp-server/test/`). Pending real-world validation. Issues and PRs welcome.
