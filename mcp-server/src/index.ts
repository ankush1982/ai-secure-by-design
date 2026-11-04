#!/usr/bin/env node
// MCP server for secure-by-design. A thin adapter over the engine in ./core, so any
// MCP client gets the same findings as the CLI, git hooks and CI.
//
//   sbd-mcp                       stdio transport (default; no network)
//   sbd-mcp --http [--port 8765]  Streamable HTTP on 127.0.0.1 (opt-in)
//
// Tools (all read-only): sbd_validate_manifest, sbd_check, sbd_scan_text, sbd_review_diff,
// sbd_list_controls, sbd_explain_control, sbd_plan_scaffold, sbd_plan_init, sbd_plan_deploy,
// sbd_evidence_plan. The two plan tools report what `sbd init` and `sbd deploy` would write;
// only the CLI writes.
// Prompts: sbd-init, sbd-check, sbd-deploy. Resources: regime catalogues, schemas, manifest.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      http: { type: 'boolean', default: false },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '8765' },
    },
  });
  const root = resolve(values.root ?? process.env.SBD_ROOT ?? process.cwd());
  const { buildServer } = await import('./server.js');
  if (values.http) {
    const { serveHttp } = await import('./http.js');
    await serveHttp(() => buildServer(root), root, values.host!, Number(values.port));
  } else {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    await buildServer(root).connect(new StdioServerTransport());
  }
}

main().catch((e) => {
  process.stderr.write(`sbd-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
