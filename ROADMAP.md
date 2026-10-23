# Roadmap

## v0.1 (this commit) — seed

- [x] Repo scaffold + Apache-2.0 licence
- [x] Plugin manifest + marketplace.json
- [x] 4 slash commands (`/sbd-init`, `/sbd-deploy`, `/sbd-check`, `/sbd-add`)
- [x] 3 subagents (profiler, scaffold-generator, regime-reviewer)
- [x] 4 skills (privacy-by-design, secure-by-design, dpdp-compliance, healthcare-ai)
- [x] PreToolUse + commit-msg + pre-commit + session-end hooks
- [x] 3 regime YAMLs (NIST SSDF 1.1, ISO 27001:2022, DPDP 2023)
- [x] TypeScript+Express scaffolds: consent, dsr_handler, audit_log, children_gate, phi_redaction, decision_log, human_oversight, rbac, security_headers, retention_runner, breach_notifier
- [x] PR template + GitHub Actions workflow
- [x] MCP server skeleton (validate-manifest, list-controls)

## v0.2 — platform-neutral engine (in progress on `v0.2-platform-neutral`)

- [x] JSON Schemas for the manifest, regime catalogues and rules (`schemas/`)
- [x] `sbd` CLI and library: `check`, `scan`, `validate`, `plan`, `controls`, `explain`, `provenance`; text, JSON and SARIF 2.1.0 output; exit codes
- [x] Check rules as data (`rules/*.yaml`)
- [x] Complete MCP server: 7 read-only tools, 3 prompts, resources; stdio and Streamable HTTP transports
- [x] pre-commit framework hooks (`.pre-commit-hooks.yaml`) and a GitHub Action (`action.yml`) with SARIF upload
- [x] Instruction packs generated from one source: CLAUDE.md, AGENTS.md, GEMINI.md, Copilot, Cursor
- [x] Fixture-based tests for the engine, hooks and MCP server
- [x] Fixes: private-key pattern never matched in the pre-write hook; hook read input from a non-existent env var and hooks.json lacked the `hooks` wrapper; scaffold names disagreed between generator, templates and check; dpdp-2023.yaml did not parse; DPDP "sensitive personal data" and "contract ground" statements; DPDP Rules 2025 status
- [ ] Cross-platform evaluation harness (same prompts through each adapter, diff the results)
- [ ] Signed releases, SBOM, permissions statement
- [ ] `init --non-interactive` and `deploy` in the CLI (today: MCP prompts + `plan`)

## v0.2.x — first feedback round

- [ ] Python + FastAPI scaffold templates (mirror of TS set)
- [ ] TypeScript + Next.js scaffold templates (app-router-aware)
- [ ] Indian data-privacy lawyer review of the DPDP scaffolds and disclaimers
- [ ] Three friends test on real Indian-product codebases; capture friction in issues

## v0.3 — second regime wave

- [ ] ISO/IEC 42001 (AI Management System) — natural for the doctor-AI use case
- [ ] HIPAA — PHI handling, BAA tracker, encryption-at-rest defaults (US healthcare angle)
- [ ] Telemedicine Practice Guidelines 2020 — India-specific healthcare add-on

## v0.4 — distribution + DX

- [ ] VS Code extension (registers MCP server, surfaces commands in palette)
- [ ] Standalone CLI (`npx @secure-by-design init`) for non-IDE workflows
- [ ] Hosted catalog browser at the project site
- [ ] Codex + Antigravity adapter docs

## Not on the roadmap (deliberately)

- Audit-evidence collection bundle (Vanta/Drata is the right tool there).
- SaaS hosting of a "compliance scoring" service.
- Government / regulator-facing certification claims.
- Sector-specific scaffolds for finance, ed-tech, gov-tech (would dilute the focus).

## How to contribute

Open an issue describing:
- A regime you'd like supported (link the official text + your draft control list)
- A stack you'd like scaffolded (link a representative project that runs the stack)
- A scaffold you wish existed (describe the control, the manifest fields it would read, and the regime clause it implements)
