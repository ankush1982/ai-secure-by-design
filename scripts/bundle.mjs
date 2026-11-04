#!/usr/bin/env node
// Bundles the CLI and MCP server into dist/, which is committed. Installs then work without
// a build step or node_modules: the Claude plugin, the pre-commit hooks and the GitHub Action
// all run `node dist/*.mjs`. Shared code and dependencies go in dist/chunks/, so each start
// file stays small, and the output is not minified, so what ships can be read.
// `npm test` fails if the committed bundles are stale.
import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const dist = join(root, 'dist');
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

if (!check) rmSync(dist, { recursive: true, force: true });
const result = await build({
  entryPoints: { sbd: join(root, 'mcp-server/src/cli.ts'), 'sbd-mcp': join(root, 'mcp-server/src/index.ts') },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  legalComments: 'none',
  logLevel: 'warning',
  write: !check,
  // Bundled CommonJS dependencies (ajv, express) call require(); give ESM one.
  banner: { js: "import { createRequire as __sbdCreateRequire } from 'node:module';\nconst require = __sbdCreateRequire(import.meta.url);" },
});

// The plugin directory refuses a start file over this size.
const LIMIT = 256 * 1024;
const start = result.outputFiles?.filter((f) => !relative(dist, f.path).startsWith('chunks')) ?? [];
for (const f of start) {
  if (f.contents.length > LIMIT) {
    console.error(`too large to start from: ${relative(root, f.path)} is ${f.contents.length} bytes`);
    process.exit(1);
  }
}

if (check) {
  const fresh = new Map(result.outputFiles.map((f) => [relative(root, f.path), f.text]));
  const stale = [];
  for (const [file, text] of fresh) {
    const path = join(root, file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) stale.push(file);
  }
  for (const file of files(dist).map((f) => relative(root, f))) if (!fresh.has(file)) stale.push(file);
  if (stale.length) {
    for (const file of stale) console.error(`stale: ${file}`);
    console.error('run: npm run build');
    process.exit(1);
  }
}
