#!/usr/bin/env node
// Renders instructions/agent-instructions.md into each platform's instruction file.
// One source, many renderings: edit the source, then run `npm run gen:instructions`.
// `--check` exits 1 if any generated file is out of date (used in tests and CI).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'instructions/agent-instructions.md'), 'utf8');
const NOTICE = '<!-- GENERATED from instructions/agent-instructions.md by scripts/gen-instructions.mjs. Do not edit by hand. -->\n';

// Where each platform reads project instructions. These are documented conventions as
// far as we know; check each tool's current docs (see README "Platform support").
const TARGETS = [
  { platform: 'claude', path: 'CLAUDE.md' },
  { platform: 'agents', path: 'templates/agent-instructions/AGENTS.md' },
  { platform: 'gemini', path: 'templates/agent-instructions/GEMINI.md' },
  { platform: 'copilot', path: 'templates/agent-instructions/.github/copilot-instructions.md' },
  {
    platform: 'cursor',
    path: 'templates/agent-instructions/.cursor/rules/secure-by-design.mdc',
    front: '---\ndescription: Secure-by-design and privacy-by-design rules driven by privacy-security-manifest.yaml\nalwaysApply: true\n---\n',
  },
];

export function render(platform) {
  const body = source.replace(/<!-- platform: ([a-z,]+) -->\n([\s\S]*?)<!-- \/platform -->\n/g, (_, list, text) =>
    list.split(',').includes(platform) ? text : '',
  );
  return body;
}

const check = process.argv.includes('--check');
let stale = 0;
for (const t of TARGETS) {
  const out = (t.front ?? '') + NOTICE + render(t.platform);
  const file = join(root, t.path);
  if (check) {
    let current = '';
    try {
      current = readFileSync(file, 'utf8');
    } catch {}
    if (current !== out) {
      console.error(`stale: ${t.path}`);
      stale++;
    }
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out);
    console.log(`wrote ${t.path}`);
  }
}
if (stale) {
  console.error('run: npm run gen:instructions');
  process.exit(1);
}
