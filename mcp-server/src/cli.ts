#!/usr/bin/env node
// sbd — command-line front end to the engine. Every other adapter (MCP server,
// git hooks, CI action, agent hooks) calls the same functions, so results match.
//
// Exit codes: 0 = no findings at or above --fail-on, 1 = findings, 2 = usage or runtime error.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  explainControl,
  listControls,
  loadManifest,
  planScaffold,
  runCheck,
  scanLines,
  scanText,
  stagedAdded,
  toSarif,
  toText,
  VERSION,
  confine,
  result,
  severityAtLeast,
  type CheckResult,
  type Finding,
  type Severity,
} from './core/index.js';

const USAGE = `sbd ${VERSION} — secure-by-design checks

Usage:
  sbd check     [--root DIR] [--manifest FILE] [--diff RANGE | --staged]
                [--format text|json|sarif] [--output FILE] [--fail-on LEVEL]
  sbd scan      [--staged | --stdin | FILE...] [--format ...] [--fail-on LEVEL]
  sbd validate  [--root DIR] [--manifest FILE] [--format text|json]
  sbd controls  [--regime ID]
  sbd explain   REGIME CONTROL
  sbd plan      [--root DIR] [--manifest FILE] [--stack STACK]
  sbd provenance COMMIT_MSG_FILE
  sbd hook claude-pretooluse     (reads Claude Code hook JSON on stdin)

LEVEL is critical|high|medium|low|info|none (default: high).
Exit codes: 0 clean, 1 findings at or above --fail-on, 2 error.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: 'string', default: '.' },
    manifest: { type: 'string' },
    diff: { type: 'string' },
    staged: { type: 'boolean', default: false },
    stdin: { type: 'boolean', default: false },
    format: { type: 'string', default: 'text' },
    output: { type: 'string' },
    'fail-on': { type: 'string', default: 'high' },
    regime: { type: 'string', default: 'all' },
    stack: { type: 'string', default: 'typescript-express' },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
});

function fail(msg: string): never {
  process.stderr.write(`sbd: ${msg}\n`);
  process.exit(2);
}

function emit(text: string): void {
  if (values.output) writeFileSync(values.output, text.endsWith('\n') ? text : `${text}\n`);
  else process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

function threshold(): Severity | undefined {
  const v = (values['fail-on'] ?? 'high').toUpperCase();
  if (v === 'NONE') return undefined;
  if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(v)) fail(`invalid --fail-on ${values['fail-on']}`);
  return v as Severity;
}

function render(r: CheckResult): void {
  switch (values.format) {
    case 'json':
      emit(JSON.stringify(r, null, 2));
      break;
    case 'sarif':
      emit(JSON.stringify(toSarif(r), null, 2));
      break;
    case 'text':
      emit(toText(r));
      break;
    default:
      fail(`unknown --format ${values.format}`);
  }
}

function exitFor(findings: Finding[]): never {
  const t = threshold();
  process.exit(t && findings.some((f) => severityAtLeast(f.severity, t)) ? 1 : 0);
}

function readStdin(): string {
  return readFileSync(0, 'utf8');
}

/** Claude Code PreToolUse adapter: block Write/Edit/MultiEdit content containing secrets. */
function claudePreToolUse(): never {
  let input: { tool_input?: Record<string, unknown> };
  try {
    input = JSON.parse(readStdin());
  } catch {
    process.exit(0); // not our input; never block on a parse problem
  }
  const ti = input.tool_input ?? {};
  const texts: string[] = [];
  for (const k of ['content', 'new_string']) if (typeof ti[k] === 'string') texts.push(ti[k] as string);
  if (Array.isArray(ti.edits)) for (const e of ti.edits as Array<Record<string, unknown>>) if (typeof e.new_string === 'string') texts.push(e.new_string);
  const file = typeof ti.file_path === 'string' ? ti.file_path : undefined;
  const findings = texts.flatMap((t) => scanText(t, file));
  if (findings.length === 0) process.exit(0);
  process.stderr.write(
    `[secure-by-design] BLOCKED: hardcoded secret in proposed edit.\n` +
      findings.map((f) => `  - ${f.ruleId} ${f.title} (line ${f.line})`).join('\n') +
      `\nMove secrets to environment variables or a secret manager. NIST SSDF PS.1.1.\n`,
  );
  process.exit(2); // exit 2 blocks the tool call; stderr is the reason shown to the agent
}

const PROVENANCE = /\[(human|ai-human-pair|ai:[a-z0-9._-]+)\]|^AI-Assistance:\s*\S+/im;

function provenance(file: string | undefined): never {
  if (!file) fail('provenance needs the commit message file');
  const msg = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n');
  if (!PROVENANCE.test(msg)) {
    process.stderr.write(
      `[secure-by-design] commit blocked: missing authorship provenance tag.\n` +
        `Add one of [human], [ai-human-pair] or [ai:<model-id>] to the message,\n` +
        `or an "AI-Assistance: <tool>" trailer. NIST SSDF PS.3.1.\n`,
    );
    process.exit(1);
  }
  const header = msg.split('\n')[0] ?? '';
  if (header.length > 100) {
    process.stderr.write(`[secure-by-design] commit header is ${header.length} chars (> 100).\n`);
    process.exit(1);
  }
  process.exit(0);
}

function main(): void {
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(cmd ? 0 : 2);
  }
  const root = resolve(values.root ?? '.');

  switch (cmd) {
    case 'check': {
      if (values.diff && values.staged) fail('use --diff or --staged, not both');
      const r = runCheck({ root, manifestPath: values.manifest, diff: values.diff, staged: values.staged });
      render(r);
      exitFor(r.findings);
    }
    case 'scan': {
      let findings: Finding[];
      if (values.staged) {
        findings = [...stagedAdded(root)].flatMap(([file, lines]) => scanLines(lines, file));
      } else if (values.stdin) {
        findings = scanText(readStdin(), '<stdin>');
      } else {
        if (rest.length === 0) fail('scan needs --staged, --stdin or files');
        findings = rest.flatMap((f) => scanText(readFileSync(confine(root, f), 'utf8'), f));
      }
      render(result(root, '-', undefined, findings));
      exitFor(findings);
    }
    case 'validate': {
      const rel = values.manifest ?? 'privacy-security-manifest.yaml';
      const { findings } = loadManifest(confine(root, rel), rel);
      render(result(root, rel, undefined, findings));
      exitFor(findings);
    }
    case 'controls':
      emit(JSON.stringify(listControls(values.regime), null, 2));
      return;
    case 'explain': {
      const [regime, control] = rest;
      if (!regime || !control) fail('explain needs REGIME CONTROL');
      const out = explainControl(regime, control);
      if (!out) fail(`unknown control ${regime}/${control}`);
      emit(JSON.stringify(out, null, 2));
      return;
    }
    case 'plan': {
      const rel = values.manifest ?? 'privacy-security-manifest.yaml';
      const { manifest, findings } = loadManifest(confine(root, rel), rel);
      if (!manifest) {
        render(result(root, rel, undefined, findings));
        process.exit(1);
      }
      emit(JSON.stringify(planScaffold(root, manifest, values.stack), null, 2));
      return;
    }
    case 'provenance':
      provenance(rest[0]);
    case 'hook':
      if (rest[0] === 'claude-pretooluse') claudePreToolUse();
      fail(`unknown hook ${rest[0] ?? ''}`);
    default:
      fail(`unknown command ${cmd}\n\n${USAGE}`);
  }
}

try {
  main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
