#!/usr/bin/env node
// Bundles the CLI and MCP server into self-contained files under dist/, which are
// committed. Installs then work without a build step or node_modules: the Claude
// plugin, the pre-commit hooks and the GitHub Action all run `node dist/*.mjs`.
// `npm test` fails if the committed bundles are stale.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  legalComments: 'none',
  minify: true,
  logLevel: 'warning',
  // Bundled CommonJS dependencies (ajv, express) call require(); give ESM one.
  banner: { js: "import { createRequire as __sbdCreateRequire } from 'node:module';\nconst require = __sbdCreateRequire(import.meta.url);" },
};

const entries = [
  { in: 'mcp-server/src/cli.ts', out: 'dist/sbd.mjs' },
  { in: 'mcp-server/src/index.ts', out: 'dist/sbd-mcp.mjs' },
];

let stale = 0;
for (const e of entries) {
  const r = await build({ ...common, entryPoints: [join(root, e.in)], outfile: join(root, e.out), write: !check });
  if (check) {
    const fresh = r.outputFiles[0].text;
    let current = '';
    try {
      current = readFileSync(join(root, e.out), 'utf8');
    } catch {}
    if (fresh !== current) {
      console.error(`stale: ${e.out}`);
      stale++;
    }
  }
}
if (stale) {
  console.error('run: npm run build');
  process.exit(1);
}
