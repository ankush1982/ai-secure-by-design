Set up secure-by-design for this project by writing `privacy-security-manifest.yaml` at the repository root.

1. Call `sbd_plan_init` (or run `sbd init --non-interactive --dry-run --format json`). It reports the stack, the personal-looking fields and a draft manifest with `TODO(user):` markers, and writes nothing. Start from that draft.
2. Ask the user which regimes apply. The catalogues available are listed by the `sbd_list_controls` tool (currently nist-ssdf-1.1, iso-27001-2022, dpdp-2023 and ai-security-wiki, the community AI control library, which is a reference and not a law). Never add a regime the user did not choose.
3. List the fields that look personal and ask the user to classify each one into a data category with a sensitivity of `not-personal`, `personal` or `sensitive-personal`. Never classify a field yourself. `sensitive-personal` is this tool's own tier for downstream scaffolds; the DPDP Act 2023 itself has no "sensitive personal data" category.
4. For DPDP, record the ground for each category: consent under s.6, or one of the specific legitimate uses in s.7. s.7 has no general "contract" ground.
5. Ask about AI systems: name, SDK, risk level, decision autonomy and human oversight.
6. Write the manifest following `schemas/manifest.schema.json` (also available as the resource `sbd://schemas/manifest`), then call `sbd_validate_manifest` and fix any findings with the user.
7. Ask before overwriting an existing manifest. `sbd_plan_init` reports one as `action: skip`, and `sbd init` never overwrites it.

The manifest records the user's declarations. It is not a compliance determination.
