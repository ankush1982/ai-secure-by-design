#!/usr/bin/env node
// secure-by-design PreToolUse hook (Claude Code adapter).
// Blocks Write/Edit/MultiEdit calls that introduce hardcoded secrets or literal personal data.
// Maps to: NIST SSDF PS.1.1, ISO 27001 A.5.34 / A.8.24.
//
// Claude Code sends the hook input as JSON on stdin. This runs the sbd engine on it, the same
// rules as git hooks and CI. Exit code 2 blocks the call and stderr is shown as the reason.
// Nothing is written to stdout, so the hook can only block a call or leave it to the normal
// permission flow.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/sbd.mjs', import.meta.url));
const scan = spawnSync(process.execPath, [cli, 'hook', 'claude-pretooluse'], {
  input: readFileSync(0),
  stdio: ['pipe', 'ignore', 'inherit'],
});
process.exit(scan.status ?? 1);
