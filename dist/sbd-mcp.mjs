#!/usr/bin/env node
import { createRequire as __sbdCreateRequire } from 'node:module';
const require = __sbdCreateRequire(import.meta.url);

// mcp-server/src/index.ts
import { resolve } from "node:path";
import { parseArgs } from "node:util";
async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      http: { type: "boolean", default: false },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "8765" }
    }
  });
  const root = resolve(values.root ?? process.env.SBD_ROOT ?? process.cwd());
  const { buildServer } = await import("./chunks/server-SID7LKTQ.mjs");
  if (values.http) {
    const { serveHttp } = await import("./chunks/http-FW5GYHRZ.mjs");
    await serveHttp(() => buildServer(root), root, values.host, Number(values.port));
  } else {
    const { StdioServerTransport } = await import("./chunks/stdio-WXEGR5VM.mjs");
    await buildServer(root).connect(new StdioServerTransport());
  }
}
main().catch((e) => {
  process.stderr.write(`sbd-mcp: ${e instanceof Error ? e.message : String(e)}
`);
  process.exit(1);
});
