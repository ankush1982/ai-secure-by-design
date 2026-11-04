// A private virtualenv for the Python scaffold checks, built from a hash-pinned lockfile and
// reused until the lockfile changes. Python 3.10+ is required: a missing interpreter fails
// the check rather than skipping it. Set SBD_PYTHON to choose the interpreter.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(root, 'scripts/python/requirements.lock');
const VENV = join(root, 'build/python-scaffolds');

function basePython() {
  const candidates = process.env.SBD_PYTHON ? [process.env.SBD_PYTHON] : ['python3', 'python', 'py'];
  for (const c of candidates) {
    const r = spawnSync(c, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']);
    if (r.status === 0) return c;
  }
  throw new Error(`scaffolds: Python 3.10+ not found (tried ${candidates.join(', ')}). Install it or set SBD_PYTHON.`);
}

export function scaffoldPython() {
  const python = process.platform === 'win32' ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python');
  const stampFile = join(VENV, 'lock.sha256');
  const stamp = createHash('sha256').update(readFileSync(LOCK)).digest('hex');
  if (existsSync(python) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) return python;

  rmSync(VENV, { recursive: true, force: true });
  execFileSync(basePython(), ['-m', 'venv', VENV], { stdio: 'pipe' });
  execFileSync(python, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '--require-hashes', '--only-binary=:all:', '-r', LOCK], { stdio: 'pipe' });
  writeFileSync(stampFile, stamp);
  return python;
}
