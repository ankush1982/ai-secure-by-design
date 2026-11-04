// The AI Security Wiki integration: the opt-in regime, the AIW-* rules and the evidence plan.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, REPO, json, sbd, tempFixture } from './helpers.mjs';

const WIKI = 'ai-security-wiki';

function project({ wiki = true } = {}) {
  const dir = tempFixture();
  if (wiki) {
    const file = join(dir, 'privacy-security-manifest.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^regimes:\n/m, `regimes:\n  - id: ${WIKI}\n`));
  }
  mkdirSync(join(dir, 'agent'));
  writeFileSync(join(dir, 'agent/run.py'), [
    'exec(llm_output)',
    'eval(model_output)  # sbd: ignore AIW-001 reviewed',
    'data = pickle.load(f)',
    'state = torch.load(path, weights_only=True)',
    'tok = AutoModel.from_pretrained("org/model", trust_remote_code=True)',
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'run-agent.sh'), 'claude --dangerously-skip-permissions\n');
  writeFileSync(join(dir, 'Dockerfile'), 'CMD ["agent", "--yolo"]\n');
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      loose: { command: 'npx', args: ['-y', 'some-server'] },
      latest: { command: 'npx', args: ['-y', '@org/server@latest'] },
      pinned: { command: 'npx', args: ['-y', '@org/server@1.2.3'] },
      image: { command: 'docker', args: ['run', '-e', 'K=1', 'org/server:1'] },
      digest: { command: 'docker', args: ['run', 'org/server@sha256:abc'] },
      remote: { url: 'http://mcp.example.com/sse' },
      local: { url: 'http://127.0.0.1:8765/mcp' },
      eager: { command: 'node', args: ['s.js'], autoApprove: ['write'] },
    },
  }, null, 2));
  return dir;
}

const lines = (findings, id) => findings.filter((f) => f.ruleId === id);

test('AIW rules run only when the wiki regime is selected', () => {
  const off = json(['check', '--root', project({ wiki: false })]);
  assert.equal(off.findings.filter((f) => f.ruleId.startsWith('AIW-')).length, 0);
  assert.ok(!off.findings.some((f) => f.regimes.some((g) => g.regime === WIKI)), 'no wiki tags unless picked');

  const on = json(['check', '--root', project()]);
  assert.ok(on.findings.some((f) => f.regimes.some((g) => g.regime === WIKI && g.control === 'AI-CTRL-008')), 'SBD rules carry wiki tags');
});

test('AIW line rules: match, exceptions, suppression and exact file names', () => {
  const { findings } = json(['check', '--root', project()]);
  const run = lines(findings, 'AIW-001');
  assert.deepEqual(run.map((f) => [f.file, f.line]), [['agent/run.py', 1]], 'the ignored line is not reported');
  assert.deepEqual(lines(findings, 'AIW-004').map((f) => f.line), [3], 'weights_only=True is accepted');
  assert.equal(lines(findings, 'AIW-005').length, 1);
  assert.deepEqual(lines(findings, 'AIW-010').map((f) => f.file).sort(), ['Dockerfile', 'run-agent.sh']);
  assert.match(run[0].remediation, /TC-L05-015/);
  assert.deepEqual(run[0].regimes.map((g) => g.control), ['AI-CTRL-020', 'AI-CTRL-022', 'AI-CTRL-027']);
});

test('MCP configuration rules', () => {
  const { findings } = json(['check', '--root', project()]);
  const msg = (id) => lines(findings, id).map((f) => f.message).join('\n');
  assert.match(msg('AIW-007'), /server loose/);
  assert.match(msg('AIW-007'), /server latest/);
  assert.match(msg('AIW-007'), /server image: image org\/server:1 is not pinned/);
  assert.doesNotMatch(msg('AIW-007'), /server (pinned|digest)/);
  assert.match(msg('AIW-008'), /server remote/);
  assert.doesNotMatch(msg('AIW-008'), /server local/);
  assert.match(msg('AIW-009'), /server eager: autoApprove/);
});

test('every wiki control referenced by a rule exists, and explain returns audit fields', () => {
  const ids = new Set(JSON.parse(sbd(['controls', '--regime', WIKI]).stdout)[0].controls.map((c) => c.id));
  assert.equal(ids.size, 46);
  const src = ['code', 'secrets', 'scaffolds', 'personal-fields', 'ai-wiki'].map((f) => readFileSync(join(REPO, `rules/${f}.yaml`), 'utf8')).join('\n');
  for (const [id] of src.matchAll(/AI-CTRL-\d{3}/g)) assert.ok(ids.has(id), `${id} exists`);
  const ex = JSON.parse(sbd(['explain', WIKI, 'AI-CTRL-045']).stdout);
  assert.match(ex.control.evidence, /Oversight design record/);
  assert.match(ex.control.url, /#ai-ctrl-045$/);
  assert.ok(ex.checkedBy.some((r) => r.id === 'SBD-SCAF-011'));
});

test('SARIF links a finding to its wiki control only when the regime is selected', () => {
  const sarif = (dir) => JSON.parse(sbd(['check', '--root', dir, '--format', 'sarif', '--fail-on', 'none']).stdout).runs[0].tool.driver.rules;
  assert.match(sarif(project()).find((r) => r.id === 'AIW-001').helpUri, /#ai-ctrl-020$/);
  assert.ok(!sarif(project({ wiki: false })).some((r) => r.helpUri));
});

test('evidence plan: one row per control, gaps from checks, no verdicts', () => {
  const dir = project();
  const p = JSON.parse(sbd(['evidence', '--root', dir, '--format', 'json']).stdout);
  assert.equal(p.controls.length, 46);
  assert.equal(p.summary.gap + p.summary.checked + p.summary.manual, 46);
  const by = Object.fromEntries(p.controls.map((c) => [c.id, c]));
  assert.equal(by['AI-CTRL-020'].status, 'gap');
  assert.equal(by['AI-CTRL-001'].status, 'manual');
  assert.match(by['AI-CTRL-020'].evidence, /Output validation rules/);

  const baseline = JSON.parse(sbd(['evidence', '--root', dir, '--format', 'json', '--tier', 'baseline']).stdout);
  assert.ok(baseline.controls.length > 0 && baseline.controls.every((c) => c.tier === 'Baseline'));

  const csv = sbd(['evidence', '--root', dir, '--format', 'csv']).stdout.trim().split('\n');
  assert.equal(csv[0], 'Control ID,Control,Result,Evidence Ref,Evidence Collection Date,Auditor Notes');
  assert.equal(csv.length, 47);
  assert.ok(csv.slice(1).every((l) => /^AI-CTRL-\d{3},("[^"]*"|[^,]*),,/.test(l)), 'Result is left for the reviewer');

  const md = sbd(['evidence', '--root', dir, '--format', 'markdown']).stdout;
  assert.match(md, /## Agents and Tools/);
  assert.match(md, /not a compliance determination/);
  assert.equal(sbd(['evidence', '--root', dir, '--format', 'xml']).code, 2);
});

test('large reports reach a pipe complete (macOS truncated at 8 KB)', () => {
  const r = spawnSync(process.execPath, [CLI, 'controls'], { encoding: 'utf8' });
  assert.ok(r.stdout.length > 8192);
  assert.equal(JSON.parse(r.stdout).length, 4);
});
