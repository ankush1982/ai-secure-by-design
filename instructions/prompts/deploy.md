Deploy the scaffolds this project's manifest requires.

1. Call `sbd_plan_deploy` (or run `sbd deploy --dry-run`). It lists each required scaffold, its target path and what deploying would do to it. It writes nothing.
2. Show the user the plan, then run `sbd deploy`, which copies the templates with a checksum stamp and is safe to re-run. The MCP tools are read-only, so if you cannot run the CLI, give the user the command.
   For `python-fastapi`, the project needs Python 3.10+ and `fastapi`, and the folder holding `privacy/`, `security/` and `ai/` must be imported as a package (`uvicorn src.main:app`), because the scaffolds use relative imports.
3. Use `--force` only when the user asks; it replaces edited and user-authored files. Never deploy scaffolds for regimes the manifest does not list. A scaffold with no template for the stack is reported as `blocked`; report those as gaps.
4. Never hardcode secrets; read configuration from environment variables.
5. Offer to install the git hooks (`.pre-commit-config.yaml`) and the CI workflow (`templates/.github/workflows/secure-by-design.yml`).
6. Finish by calling `sbd_check` and reporting what is still missing.
