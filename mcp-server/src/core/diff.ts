// Git diff helpers: which lines a change adds. Used by `sbd scan --staged` and
// `sbd check --diff` so hooks and PR checks only report on new code.
import { execFileSync } from 'node:child_process';
import type { TextLine } from './scan.js';

export type AddedLines = Map<string, TextLine[]>;

export function parseUnifiedDiff(diff: string): AddedLines {
  const out: AddedLines = new Map();
  let file: string | undefined;
  let next = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) {
      const p = l.slice(4).trim();
      file = p === '/dev/null' ? undefined : p.replace(/^b\//, '');
      if (file && !out.has(file)) out.set(file, []);
    } else if (l.startsWith('@@')) {
      const m = /\+(\d+)(?:,\d+)?/.exec(l);
      next = m ? Number(m[1]) : 0;
    } else if (file && l.startsWith('+')) {
      out.get(file)!.push({ line: next, text: l.slice(1) });
      next++;
    } else if (file && l.startsWith(' ')) {
      next++;
    }
  }
  return out;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Lines added in the index (what `git commit` would record). */
export function stagedAdded(root: string): AddedLines {
  return parseUnifiedDiff(git(root, ['diff', '--cached', '--relative', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR']));
}

/** Lines added in a revision range such as origin/main...HEAD. */
export function rangeAdded(root: string, range: string): AddedLines {
  if (range.startsWith('-') || !/^[\w./~^@{}-]+(\.\.\.?[\w./~^@{}-]+)?$/.test(range)) throw new Error(`invalid git range: ${range}`);
  return parseUnifiedDiff(git(root, ['diff', '--relative', '--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', range, '--']));
}
