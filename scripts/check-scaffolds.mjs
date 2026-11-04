#!/usr/bin/env node
// Type-checks the scaffolds the way /sbd-deploy lays them out, both with every scaffold and
// with the smallest AI set (a non-healthcare project gets no phi_redaction), so a scaffold
// cannot ship with an error or depend on a file that may not be deployed.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { rules } = parse(readFileSync(join(root, 'rules/scaffolds.yaml'), 'utf8'));
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const SETS = { all: () => true, 'ai without phi_redaction': (r) => ['audit_log', 'decision_log', 'human_oversight'].includes(r.name) };

let failed = false;
for (const [label, keep] of Object.entries(SETS)) {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-scaffolds-'));
  for (const r of rules.filter(keep)) {
    mkdirSync(join(dir, r.dir), { recursive: true });
    copyFileSync(join(root, 'templates/typescript-express', r.template), join(dir, r.dir, `${r.name}.ts`));
  }
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, esModuleInterop: true, noEmit: true, skipLibCheck: true, typeRoots: [join(root, 'node_modules/@types')], types: ['node', 'express'] },
    include: ['src'],
  }));
  try {
    execFileSync(process.execPath, [tsc, '-p', dir], { stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    failed = true;
    console.error(`scaffolds (${label}):\n${e.stdout}`);
  }
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
