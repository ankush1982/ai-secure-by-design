Deploy the scaffolds this project's manifest requires.

1. Call `sbd_plan_scaffold` (or run `sbd plan`). It lists each required scaffold, its target path, its template and whether it is already present. The stack comes from `product.stack` in the manifest unless you pass one (`typescript-express`, `python-fastapi`).
2. Show the user the plan. For each missing scaffold, copy the template to the target path and adapt it to the manifest values (data categories, retention, AI systems).
   For `python-fastapi`, the project needs Python 3.10+ and `fastapi`, and the folder holding `privacy/`, `security/` and `ai/` must be imported as a package (`uvicorn src.main:app`), because the scaffolds use relative imports.
3. Never overwrite an existing file without asking. Never deploy scaffolds for regimes the manifest does not list, or for stacks without templates; report those as gaps instead.
4. Never hardcode secrets; read configuration from environment variables.
5. Offer to install the git hooks (`.pre-commit-config.yaml`) and the CI workflow (`templates/.github/workflows/secure-by-design.yml`).
6. Finish by calling `sbd_check` and reporting what is still missing.
