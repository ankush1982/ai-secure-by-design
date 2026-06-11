# Roadmap

## v0.1 (this commit) — seed

- [x] Repo scaffold + Apache-2.0 licence
- [x] Plugin manifest + marketplace.json
- [x] 4 slash commands (`/sbd-init`, `/sbd-deploy`, `/sbd-check`, `/sbd-add`)
- [x] 3 subagents (profiler, scaffold-generator, regime-reviewer)
- [x] 4 skills (privacy-by-design, secure-by-design, dpdp-compliance, healthcare-ai)
- [x] PreToolUse + commit-msg + pre-commit + session-end hooks
- [x] 3 regime YAMLs (NIST SSDF 1.1, ISO 27001:2022, DPDP 2023)
- [x] TypeScript+Express scaffolds: consent, dsr-handler, audit-log, children-gate, phi-redaction, ai-decision-log, human-oversight, rbac, security-headers, retention-runner, breach-notifier
- [x] PR template + GitHub Actions workflow
- [x] MCP server skeleton (validate-manifest, list-controls)

## v0.2 — first feedback round

- [ ] Python + FastAPI scaffold templates (mirror of TS set)
- [ ] TypeScript + Next.js scaffold templates (app-router-aware)
- [ ] Real implementation of `sbd_check_regimes` MCP tool (parity with `/sbd-check`)
- [ ] Real implementation of `sbd_generate_scaffold` MCP tool
- [ ] Cursor rule pack + `mcp.json` snippet for non-Claude-Code users
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
