Deploy the scaffolds this project's manifest requires.

1. Call `sbd_plan_scaffold` (or run `sbd plan`). It lists each required scaffold, its target path, its template and whether it is already present.
2. Show the user the plan. For each missing scaffold, copy the template to the target path and adapt it to the manifest values (data categories, retention, AI systems).
3. Never overwrite an existing file without asking. Never deploy scaffolds for regimes the manifest does not list, or for stacks without templates; report those as gaps instead.
4. Never hardcode secrets; read configuration from environment variables.
5. Offer to install the git hooks (`.pre-commit-config.yaml`) and the CI workflow (`templates/.github/workflows/secure-by-design.yml`).
6. Finish by calling `sbd_check` and reporting what is still missing.
