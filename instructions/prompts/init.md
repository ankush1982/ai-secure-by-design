Set up secure-by-design for this project by writing `privacy-security-manifest.yaml` at the repository root.

1. Look at the repository to infer the stack (package.json, pyproject.toml, requirements.txt) and the data model files (Prisma schema, SQL migrations, SQLAlchemy/Django/Pydantic models, Drizzle schema).
2. Ask the user which regimes apply. The catalogues available are listed by the `sbd_list_controls` tool (currently nist-ssdf-1.1, iso-27001-2022 and dpdp-2023). Never add a regime the user did not choose.
3. List the fields that look personal and ask the user to classify each one into a data category with a sensitivity of `not-personal`, `personal` or `sensitive-personal`. Never classify a field yourself. `sensitive-personal` is this tool's own tier for downstream scaffolds; the DPDP Act 2023 itself has no "sensitive personal data" category.
4. For DPDP, record the ground for each category: consent under s.6, or one of the specific legitimate uses in s.7. s.7 has no general "contract" ground.
5. Ask about AI systems: name, SDK, risk level, decision autonomy and human oversight.
6. Write the manifest following `schemas/manifest.schema.json` (also available as the resource `sbd://schemas/manifest`), then call `sbd_validate_manifest` and fix any findings with the user.
7. Ask before overwriting an existing manifest.

The manifest records the user's declarations. It is not a compliance determination.
