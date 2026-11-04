#!/usr/bin/env node
// secure-by-design Stop hook. Lightweight reminder so regime-relevant changes aren't
// forgotten before commit. It never blocks. A Stop hook's plain output only reaches the debug
// log, so the reminder goes out as a systemMessage, which the user sees.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Only fire if a manifest is present in the cwd.
if (!existsSync('privacy-security-manifest.yaml')) process.exit(0);

let changed = [];
try {
  changed = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
} catch {
  process.exit(0); // not a git repository
}

const layer = changed.filter((f) => /^src\/(privacy|security|ai)\//.test(f));
const schema = changed.some((f) => /(schema\.prisma|models?\.(py|ts)|migrations?\/|.*\.sql)$/.test(f));
const stale = schema && !changed.includes('privacy-security-manifest.yaml');

const notes = [];
if (layer.length) notes.push(`${layer.length} privacy, security or AI file(s) changed`);
if (stale) notes.push('schema changed but the manifest did not');
if (notes.length) console.log(JSON.stringify({ systemMessage: `secure-by-design: ${notes.join('; ')}. Run /sbd-check before committing.` }));
