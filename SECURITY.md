# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through [GitHub's vulnerability reporting form](https://github.com/ankush1982/ai-secure-by-design/security/advisories/new).

Include the affected version or commit, the steps to reproduce, and the impact you expect. This project is pre-release, so there is no fixed response time yet.

## Supported versions

Only the latest commit on `main` gets fixes until the first tagged release.

## In scope

- The `sbd` engine, CLI and MCP server, including path confinement and HTTP mode
- Git hooks and the GitHub Action
- Secret patterns that can be bypassed
- Scaffolds in `templates/` that ship with an exploitable flaw

## Out of scope

- A missed finding or false positive in a check with no security impact: please [open an issue](https://github.com/ankush1982/ai-secure-by-design/issues/new/choose)
- Disagreements over how a regime is interpreted: please open an issue, and see [LEGAL-DISCLAIMER.md](./LEGAL-DISCLAIMER.md)
- Your own code after you have changed a scaffold

## Pinning

Pin the GitHub Action and pre-commit hooks to a tag or commit SHA, as the [README](./README.md) shows, so an upstream change cannot alter your checks without review.
