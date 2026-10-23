Check this project against its secure-by-design manifest.

1. Call the `sbd_check` tool (or run `sbd check --format json` if no MCP tools are available). Do not re-derive the checks yourself: the tool's findings are the result.
2. Report the findings grouped by severity, using the tool's rule IDs, files and lines. Do not add, drop or re-rate findings.
3. For each finding, explain the risk in one sentence and propose a concrete fix. Do not apply fixes without the user's go-ahead.
4. For unclassified fields (SBD-FIELD-001), ask the user how to classify them; never classify for them.
5. Close by saying this is a list of control gaps, not a compliance determination.
