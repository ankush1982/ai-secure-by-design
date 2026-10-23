// Workspace file listing. Uses git (respects .gitignore) when the root is a git
// work tree, otherwise walks the tree skipping the usual vendored directories.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toPosix } from './paths.js';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.next']);
const MAX_BYTES = 1_000_000;

export function listFiles(root: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean).filter((f) => !f.split('/').some((p) => SKIP_DIRS.has(p))).sort();
  } catch {
    return walk(root, '').sort();
  }
}

function walk(root: string, rel: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(root, childRel));
    } else if (entry.isFile()) {
      out.push(toPosix(childRel));
    }
  }
  return out;
}

/** Returns file text, or undefined for large or binary files. */
export function readText(abs: string): string | undefined {
  try {
    if (statSync(abs).size > MAX_BYTES) return undefined;
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8192).includes(0)) return undefined;
    return buf.toString('utf8');
  } catch {
    return undefined;
  }
}
