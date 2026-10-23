import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { CLI, FAKE, FIXTURE, REPO, json, sbd, tempFixture } from './helpers.mjs';

const brief = (r) => r.findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity, file: f.file ?? null, line: f.line ?? null }));

test('fixture produces exactly the expected findings (golden)', () => {
  const expected = JSON.parse(readFileSync(join(REPO, 'mcp-server/test/fixtures/clinic-app.expected.json'), 'utf8'));
  assert.deepEqual(brief(json(['check', '--root', tempFixture()])), expected);
});

test('results are deterministic across runs', () => {
  const dir = tempFixture();
  assert.deepEqual(json(['check', '--root', dir]).findings, json(['check', '--root', dir]).findings);
});

test('exit codes: 1 on findings, 0 with --fail-on none, 2 on usage error', () => {
  const dir = tempFixture();
  assert.equal(sbd(['check', '--root', dir]).code, 1);
  assert.equal(sbd(['check', '--root', dir, '--fail-on', 'none']).code, 0);
  assert.equal(sbd(['check', '--root', dir, '--format', 'xml']).code, 2);
  assert.equal(sbd(['nonsense']).code, 2);
});

test('secrets are found and masked in output', () => {
  const dir = tempFixture();
  writeFileSync(join(dir, 'src/config.ts'), `export const key = '${FAKE.aws}';\n`);
  const r = json(['check', '--root', dir]);
  const f = r.findings.find((x) => x.ruleId === 'SBD-SECRET-001');
  assert.ok(f, 'AWS key found');
  assert.equal(f.file, 'src/config.ts');
  assert.ok(!f.snippet.includes(FAKE.aws), 'snippet must not repeat the secret');
});

test('R-D1: private key headers are detected by the engine', () => {
  const r = spawnSync(process.execPath, [CLI, 'scan', '--stdin', '--format', 'json', '--fail-on', 'none'], { input: `${FAKE.pem}\nMIIE...\n`, encoding: 'utf8' });
  assert.ok(JSON.parse(r.stdout).findings.some((f) => f.ruleId === 'SBD-SECRET-003'));
});

test('R-D1 / R-L1: shell PreToolUse fallback reads stdin JSON and blocks a private key', () => {
  // Force the grep fallback by pointing CLAUDE_PLUGIN_ROOT at a directory without a build.
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'k.pem', content: `${FAKE.pem}\nabc\n` } });
  const r = spawnSync('bash', [join(REPO, 'hooks/pre-write-secret-scan.sh')], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: tempFixture() },
  });
  if (r.stderr.includes('install jq')) return; // jq missing on this machine; engine path is tested below
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /PRIVATE KEY/);
});

test('Claude PreToolUse adapter (engine path) blocks Write, Edit and MultiEdit, allows clean input', () => {
  const run = (tool_input) =>
    spawnSync('bash', [join(REPO, 'hooks/pre-write-secret-scan.sh')], {
      input: JSON.stringify({ tool_name: 'X', tool_input }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO },
    });
  assert.equal(run({ content: `k = "${FAKE.aws}"` }).status, 2);
  assert.equal(run({ new_string: FAKE.pem }).status, 2);
  assert.equal(run({ edits: [{ old_string: 'a', new_string: FAKE.aws }] }).status, 2);
  assert.equal(run({ content: 'const ok = process.env.KEY;' }).status, 0);
  assert.equal(spawnSync(process.execPath, [CLI, 'hook', 'claude-pretooluse'], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('R-D2: scaffolds count as present under snake_case or kebab-case names', () => {
  const dir = tempFixture();
  mkdirSync(join(dir, 'src/privacy'), { recursive: true });
  writeFileSync(join(dir, 'src/privacy/dsr_handler.ts'), '// x\n');
  writeFileSync(join(dir, 'src/privacy/retention-runner.ts'), '// x\n');
  const ids = json(['check', '--root', dir]).findings.map((f) => f.ruleId);
  assert.ok(!ids.includes('SBD-SCAF-002'));
  assert.ok(!ids.includes('SBD-SCAF-003'));
  assert.ok(ids.includes('SBD-SCAF-001'));
});

test('R-D2: every scaffold rule points at a template that exists', () => {
  const plan = JSON.parse(sbd(['plan', '--root', REPO, '--manifest', 'mcp-server/test/fixtures/clinic-app/privacy-security-manifest.yaml']).stdout);
  assert.ok(plan.length >= 10);
  for (const item of plan) assert.ok(item.templateExists, `${item.template} missing`);
});

test('--staged and --diff report only added lines', () => {
  const dir = tempFixture({ git: true });
  const path = join(dir, 'src/routes/patients.ts');
  writeFileSync(path, readFileSync(path, 'utf8') + `\nrouter.put('/x', h);\nconsole.log(user.phone);\n`);
  execFileSync('git', ['add', '.'], { cwd: dir });
  const staged = json(['check', '--root', dir, '--staged']).findings.filter((f) => f.line);
  assert.deepEqual(staged.map((f) => f.ruleId).sort(), ['SBD-CODE-001', 'SBD-CODE-002']);
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-q', '--no-verify', '-m', 'x [human]'], { cwd: dir });
  const ranged = json(['check', '--root', dir, '--diff', 'HEAD~1...HEAD']).findings.filter((f) => f.line);
  assert.deepEqual(ranged.map((f) => f.line), staged.map((f) => f.line));
  assert.equal(sbd(['check', '--root', dir, '--diff=--output=x']).code, 2, 'ranges that look like git options are refused');
});

test('audit-log window does not borrow a later handler\'s auditLog call', () => {
  const dir = tempFixture();
  writeFileSync(join(dir, 'src/routes/a.ts'), "router.post('/a', h1);\nrouter.post('/b', async () => {\n  auditLog({});\n});\n");
  const lines = json(['check', '--root', dir]).findings.filter((f) => f.file === 'src/routes/a.ts').map((f) => f.line);
  assert.deepEqual(lines, [1]);
});

test('SARIF 2.1.0 output has one result per finding and rule metadata', () => {
  const dir = tempFixture();
  const r = sbd(['check', '--root', dir, '--format', 'sarif', '--fail-on', 'none']);
  const sarif = JSON.parse(r.stdout);
  const findings = json(['check', '--root', dir]).findings;
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results.length, findings.length);
  const ruleIds = sarif.runs[0].tool.driver.rules.map((x) => x.id);
  for (const res of sarif.runs[0].results) {
    assert.equal(ruleIds[res.ruleIndex], res.ruleId);
    assert.ok(['error', 'warning', 'note'].includes(res.level));
    assert.ok(res.locations[0].physicalLocation.artifactLocation.uri);
  }
});

test('example manifest is valid and has no findings', () => {
  const r = json(['validate', '--root', join(REPO, 'templates'), '--manifest', 'privacy-security-manifest.example.yaml']);
  assert.deepEqual(r.findings, []);
});

test('R-E2: contract ground under DPDP is flagged', () => {
  assert.ok(json(['check', '--root', tempFixture()]).findings.some((f) => f.ruleId === 'SBD-MANIFEST-008'));
});

test('schema errors become findings, not crashes', () => {
  const dir = tempFixture();
  writeFileSync(join(dir, 'privacy-security-manifest.yaml'), 'schemaVersion: "9"\nproduct: {}\n');
  const r = json(['check', '--root', dir]);
  assert.ok(r.findings.length > 0 && r.findings.every((f) => f.ruleId === 'SBD-MANIFEST-003'));
  const missing = json(['check', '--root', dir, '--manifest', 'nope.yaml']);
  assert.equal(missing.findings[0].ruleId, 'SBD-MANIFEST-001');
});

test('paths outside the root are refused', () => {
  const r = sbd(['check', '--root', FIXTURE, '--manifest', '../../../../package.json']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /outside the workspace root/);
});

test('every rule references a regime control that exists', () => {
  const regimes = Object.fromEntries(
    readdirSync(join(REPO, 'regimes')).map((f) => {
      const y = parse(readFileSync(join(REPO, 'regimes', f), 'utf8'));
      return [y.id, new Set(y.controls.map((c) => c.id))];
    }),
  );
  for (const f of readdirSync(join(REPO, 'rules'))) {
    const y = parse(readFileSync(join(REPO, 'rules', f), 'utf8'));
    const refs = [...(y.regimes ?? []), ...(y.rules ?? []).flatMap((r) => r.regimes ?? [])];
    for (const ref of refs) assert.ok(regimes[ref.regime]?.has(ref.control), `${f}: ${ref.regime}/${ref.control}`);
  }
});

test('explain and controls commands', () => {
  const ex = JSON.parse(sbd(['explain', 'iso-27001-2022', 'logging']).stdout);
  assert.ok(ex.checkedBy.some((r) => r.id === 'SBD-CODE-001'));
  assert.equal(sbd(['explain', 'iso-27001-2022', 'nope']).code, 2);
  assert.equal(JSON.parse(sbd(['controls']).stdout).length, 3);
});

test('provenance hook accepts tags and trailers, rejects untagged messages', () => {
  const dir = tempFixture();
  const msg = (text) => {
    const p = join(dir, 'MSG');
    writeFileSync(p, text);
    return sbd(['provenance', p]).code;
  };
  assert.equal(msg('feat: x [human]\n'), 0);
  assert.equal(msg('feat: x [ai:some-model]\n'), 0);
  assert.equal(msg('feat: x\n\nAI-Assistance: claude-code\n'), 0);
  assert.equal(msg('feat: x\n# [human] in a comment does not count\n'), 1);
  assert.equal(msg(`${'a'.repeat(101)} [human]\n`), 1);
});

test('generated instruction packs are up to date', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/gen-instructions.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
