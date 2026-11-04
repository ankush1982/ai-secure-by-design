#!/usr/bin/env node
// Type-checks the scaffolds the way /sbd-deploy lays them out, both with every scaffold and
// with the smallest AI set (a non-healthcare project gets no phi_redaction), so a scaffold
// cannot ship with an error or depend on a file that may not be deployed. Python scaffolds
// must also compile and import.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { scaffoldPython } from './python-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { rules, stacks } = parse(readFileSync(join(root, 'rules/scaffolds.yaml'), 'utf8'));
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const SETS = { all: () => true, 'ai without phi_redaction': (r) => ['audit_log', 'decision_log', 'human_oversight'].includes(r.name) };

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

function checkTypescript(dir) {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, esModuleInterop: true, noEmit: true, skipLibCheck: true, typeRoots: [join(root, 'node_modules/@types')], types: ['node', 'express'] },
    include: ['src'],
  }));
  run(process.execPath, [tsc, '-p', dir]);
}

function checkPython(dir, deployed) {
  const python = scaffoldPython();
  run(python, ['-m', 'compileall', '-q', 'src'], dir);
  run(python, ['-m', 'mypy', '--strict', '--python-version', '3.10', '--namespace-packages', '--explicit-package-bases', '--cache-dir', join(root, 'build/mypy-cache'), 'src'], dir);
  const imports = deployed.map((r) => `import ${r.dir.replaceAll('/', '.')}.${r.name}`).join('\n');
  run(python, ['-c', imports], dir);
}

const CHECKS = { 'typescript-express': checkTypescript, 'python-fastapi': checkPython };

let failed = false;
for (const [stack, check] of Object.entries(CHECKS)) {
  const ext = stacks[stack];
  const shipped = readdirSync(join(root, 'templates', stack)).filter((f) => f.endsWith(ext)).sort();
  const expected = rules.map((r) => `${r.template}${ext}`).sort();
  if (shipped.join() !== expected.join()) {
    failed = true;
    console.error(`scaffolds (${stack}): templates [${shipped}] do not match rules/scaffolds.yaml [${expected}]`);
  }
  for (const [label, keep] of Object.entries(SETS)) {
    const dir = mkdtempSync(join(tmpdir(), 'sbd-scaffolds-'));
    const deployed = rules.filter(keep);
    try {
      for (const r of deployed) {
        const template = join(root, 'templates', stack, `${r.template}${ext}`);
        mkdirSync(join(dir, r.dir), { recursive: true });
        if (existsSync(template)) copyFileSync(template, join(dir, r.dir, `${r.name}${ext}`));
      }
      check(dir, deployed);
    } catch (e) {
      failed = true;
      console.error(`scaffolds (${stack}, ${label}):\n${e.stdout || ''}${e.stderr || ''}${e.stdout || e.stderr ? '' : e.message}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
