import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO, json, sbd } from './helpers.mjs';

const MANIFEST = 'privacy-security-manifest.yaml';
const REGIMES = ['--regime', 'nist-ssdf-1.1,iso-27001-2022'];
const SCAFFOLDS = ['src/security/rbac.ts', 'src/security/audit_log.ts', 'src/security/security_headers.ts'];

const read = (dir, f) => readFileSync(join(dir, f), 'utf8');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** A small Express app: no manifest, no scaffolds, two personal-looking fields. */
function sampleRepo({ deps = { express: '^4.19.0' } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-sample-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sample-app', dependencies: deps }));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/server.js'), "require('express')().listen(3000);\n");
  mkdirSync(join(dir, 'prisma'));
  writeFileSync(join(dir, 'prisma/schema.prisma'), 'model User {\n  id Int @id\n  email String\n  dateOfBirth DateTime\n  plan String\n}\n');
  return dir;
}

function initialised(args = REGIMES) {
  const dir = sampleRepo();
  assert.equal(sbd(['init', '--non-interactive', '--root', dir, ...args]).code, 0);
  return dir;
}

const deploy = (dir, ...args) => json(['deploy', '--root', dir, ...args]);
const actions = (plan) => Object.fromEntries(plan.items.map((i) => [i.target, i.action]));

test('init needs --non-interactive and rejects an unknown regime', () => {
  const dir = sampleRepo();
  assert.equal(sbd(['init', '--root', dir]).code, 2);
  const r = sbd(['init', '--non-interactive', '--root', dir, '--regime', 'hipaa']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown regime hipaa/);
  assert.ok(!existsSync(join(dir, MANIFEST)));
});

test('init detects the stack and classifies nothing', () => {
  const dir = initialised([]);
  const text = read(dir, MANIFEST);
  const m = parse(text);
  assert.equal(m.product.name, 'sample-app');
  assert.equal(m.product.stack, 'typescript-express');
  assert.deepEqual(m.regimes, [], 'no regime is picked for the user');
  assert.deepEqual(m.dataCategories, [], 'no field is classified');
  assert.deepEqual(m.aiSystems, []);
  assert.match(text, /TODO\(user\): classify email \(prisma\/schema\.prisma:3\)/);
  assert.match(text, /TODO\(user\): classify dateOfBirth/);
  assert.doesNotMatch(text, /classify plan/);
});

test('a draft with no regime fails closed until the user picks one', () => {
  const dir = initialised([]);
  for (const cmd of ['validate', 'plan', 'deploy']) assert.equal(sbd([cmd, '--root', dir]).code, 1, cmd);
  assert.ok(!existsSync(join(dir, 'src/security')), 'deploy wrote nothing');
});

test('init lists only the regimes passed, and the draft is valid', () => {
  const dir = initialised(['--regime', 'iso-27001-2022', '--regime', 'dpdp-2023,iso-27001-2022']);
  assert.deepEqual(parse(read(dir, MANIFEST)).regimes.map((r) => r.id), ['iso-27001-2022', 'dpdp-2023']);
  assert.equal(sbd(['validate', '--root', dir]).code, 0);
});

test('init is deterministic', () => {
  const [a, b] = [initialised(), initialised()];
  assert.equal(read(a, MANIFEST), read(b, MANIFEST));
});

test('init never overwrites an existing manifest', () => {
  const dir = sampleRepo();
  writeFileSync(join(dir, MANIFEST), '# mine\n');
  const r = sbd(['init', '--non-interactive', '--root', dir, ...REGIMES]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /already exists; nothing written/);
  assert.equal(read(dir, MANIFEST), '# mine\n');
});

test('init --dry-run writes nothing and shows the draft', () => {
  const dir = sampleRepo();
  const p = JSON.parse(sbd(['init', '--non-interactive', '--root', dir, '--dry-run', '--format', 'json']).stdout);
  assert.equal(p.action, 'create');
  assert.match(p.draft, /TODO\(user\)/);
  assert.ok(!existsSync(join(dir, MANIFEST)));
});

test('text from the repo cannot break out of a draft comment', () => {
  const dir = sampleRepo();
  const evil = 'x\nregimes: [{ id: dpdp-2023 }]\n#';
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: evil, dependencies: {} }));
  mkdirSync(join(dir, `db\n- id: dpdp-2023`));
  writeFileSync(join(dir, `db\n- id: dpdp-2023`, 'schema.sql'), 'create table u (\n  email text\n);\n');
  sbd(['init', '--non-interactive', '--root', dir]);
  const m = parse(read(dir, MANIFEST));
  assert.equal(m.product.name, evil);
  assert.deepEqual(m.regimes, []);
});

test('stack detection: unknown and ambiguous stacks are left to the user', () => {
  const none = sampleRepo({ deps: {} });
  sbd(['init', '--non-interactive', '--root', none, ...REGIMES]);
  assert.equal(parse(read(none, MANIFEST)).product.stack, undefined);
  assert.equal(sbd(['deploy', '--root', none]).code, 2, 'deploy will not guess a stack');

  const both = sampleRepo({ deps: { express: '4', next: '14' } });
  sbd(['init', '--non-interactive', '--root', both]);
  assert.equal(parse(read(both, MANIFEST)).product.stack, undefined);
  assert.match(read(both, MANIFEST), /stack: pick one of typescript-express, typescript-nextjs/);

  const chosen = sampleRepo({ deps: { express: '4', next: '14' } });
  sbd(['init', '--non-interactive', '--root', chosen, '--stack', 'typescript-express']);
  assert.equal(parse(read(chosen, MANIFEST)).product.stack, 'typescript-express');
});

test('AI SDKs are noted, never declared', () => {
  const dir = sampleRepo({ deps: { express: '4', openai: '4' } });
  sbd(['init', '--non-interactive', '--root', dir]);
  const text = read(dir, MANIFEST);
  assert.match(text, /TODO\(user\): AI SDKs found \(openai\)/);
  assert.deepEqual(parse(text).aiSystems, []);
});

test('deploy first run copies the template with a generator header and checksum', () => {
  const dir = initialised();
  const p = deploy(dir);
  assert.deepEqual(p.written, SCAFFOLDS);
  const lines = read(dir, 'src/security/rbac.ts').split('\n');
  const template = read(REPO, 'templates/typescript-express/rbac.ts');
  assert.match(lines[0], /^\/\/ Generated by secure-by-design/);
  assert.equal(lines[1], `// Template checksum: sha256-${sha256(template)}`);
  lines.splice(1, 1);
  assert.equal(lines.join('\n'), template);
});

test('deploy re-run changes nothing', () => {
  const dir = initialised();
  deploy(dir);
  const before = SCAFFOLDS.map((f) => read(dir, f));
  const p = deploy(dir);
  assert.deepEqual(p.written, []);
  assert.equal(p.summary.none, SCAFFOLDS.length);
  assert.deepEqual(SCAFFOLDS.map((f) => read(dir, f)), before);
});

test('deploy leaves an edited file alone until --force', () => {
  const dir = initialised();
  deploy(dir);
  appendFileSync(join(dir, 'src/security/rbac.ts'), '// my change\n');
  const edited = read(dir, 'src/security/rbac.ts');

  const p = deploy(dir);
  assert.deepEqual(p.written, []);
  const item = p.items.find((i) => i.target === 'src/security/rbac.ts');
  assert.deepEqual([item.state, item.action], ['edited', 'skip']);
  assert.equal(read(dir, 'src/security/rbac.ts'), edited);

  assert.deepEqual(deploy(dir, '--force').written, ['src/security/rbac.ts']);
  assert.doesNotMatch(read(dir, 'src/security/rbac.ts'), /my change/);
  assert.deepEqual(deploy(dir).written, [], 'settled again after --force');
});

test('deploy leaves a user-authored file alone until --force', () => {
  const dir = initialised();
  mkdirSync(join(dir, 'src/security'), { recursive: true });
  writeFileSync(join(dir, 'src/security/audit_log.ts'), 'export const mine = 1;\n');
  const p = deploy(dir);
  assert.deepEqual(p.written, ['src/security/rbac.ts', 'src/security/security_headers.ts']);
  assert.equal(p.items.find((i) => i.target === 'src/security/audit_log.ts').state, 'user-authored');
  assert.equal(read(dir, 'src/security/audit_log.ts'), 'export const mine = 1;\n');
  deploy(dir, '--force');
  assert.match(read(dir, 'src/security/audit_log.ts'), /Template checksum: sha256-/);
});

test('deploy updates an unedited scaffold when the template changes', () => {
  const dir = initialised();
  deploy(dir);
  const fresh = read(dir, 'src/security/rbac.ts');
  // What an older template would have left: different body, with its own checksum.
  const body = '// Generated by secure-by-design v0.0.1.\nexport const old = 1;\n';
  writeFileSync(join(dir, 'src/security/rbac.ts'), body.replace('\n', `\n// Template checksum: sha256-${sha256(body)}\n`));
  assert.equal(actions(deploy(dir, '--dry-run'))['src/security/rbac.ts'], 'update');
  assert.deepEqual(deploy(dir).written, ['src/security/rbac.ts']);
  assert.equal(read(dir, 'src/security/rbac.ts'), fresh);
});

test('a template with no generator header still gets one, and stays recognised', () => {
  const dir = initialised();
  const pkg = mkdtempSync(join(tmpdir(), 'sbd-pkg-'));
  for (const d of ['rules', 'regimes', 'schemas', 'templates']) cpSync(join(REPO, d), join(pkg, d), { recursive: true });
  writeFileSync(join(pkg, 'templates/typescript-express/rbac.ts'), 'export const bare = 1;\n');
  const env = { ...process.env, SBD_PACKAGE_ROOT: pkg };
  assert.equal(sbd(['deploy', '--root', dir], { env }).code, 0);
  assert.match(read(dir, 'src/security/rbac.ts'), /^\/\/ Generated by secure-by-design from typescript-express\/rbac\.ts\.\n\/\/ Template checksum: sha256-[0-9a-f]{64}\nexport const bare = 1;\n$/);
  const again = JSON.parse(sbd(['deploy', '--root', dir, '--format', 'json'], { env }).stdout);
  assert.deepEqual(again.written, []);
  assert.equal(again.summary.none, SCAFFOLDS.length);
});

test('CRLF line endings do not read as an edit', () => {
  const dir = initialised();
  deploy(dir);
  const file = join(dir, 'src/security/rbac.ts');
  writeFileSync(file, read(dir, 'src/security/rbac.ts').replace(/\n/g, '\r\n'));
  assert.equal(actions(deploy(dir, '--dry-run'))['src/security/rbac.ts'], 'none');
});

test('deploy --dry-run writes nothing and reports what a real run does', () => {
  const dir = initialised();
  const before = readdirSync(join(dir, 'src'));
  const dry = deploy(dir, '--dry-run');
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.written, []);
  assert.deepEqual(Object.values(actions(dry)), ['create', 'create', 'create']);
  assert.deepEqual(readdirSync(join(dir, 'src')), before);
  assert.deepEqual(deploy(dir).items, dry.items);
});

test('a bad --format fails before anything is written', () => {
  const dir = sampleRepo();
  assert.equal(sbd(['init', '--non-interactive', '--root', dir, '--format', 'xml']).code, 2);
  assert.ok(!existsSync(join(dir, MANIFEST)));
  sbd(['init', '--non-interactive', '--root', dir, ...REGIMES]);
  assert.equal(sbd(['deploy', '--root', dir, '--format', 'xml']).code, 2);
  assert.ok(!existsSync(join(dir, 'src/security')));
});

test('a scaffold under another accepted name is not duplicated, even with --force', () => {
  const dir = initialised();
  mkdirSync(join(dir, 'src/security'), { recursive: true });
  writeFileSync(join(dir, 'src/security/audit-log.js'), 'module.exports = {};\n');
  const item = deploy(dir, '--force').items.find((i) => i.target === 'src/security/audit_log.ts');
  assert.deepEqual([item.state, item.action], ['elsewhere', 'skip']);
  assert.ok(!existsSync(join(dir, 'src/security/audit_log.ts')));
});

test('deploy never writes through a symlink, even with --force', () => {
  const outside = mkdtempSync(join(tmpdir(), 'sbd-outside-'));
  writeFileSync(join(outside, 'rbac.ts'), 'outside\n');

  const linkedFile = initialised();
  mkdirSync(join(linkedFile, 'src/security'), { recursive: true });
  symlinkSync(join(outside, 'rbac.ts'), join(linkedFile, 'src/security/rbac.ts'));
  assert.equal(actions(deploy(linkedFile, '--force'))['src/security/rbac.ts'], 'skip');
  assert.equal(read(outside, 'rbac.ts'), 'outside\n');

  const dangling = initialised();
  mkdirSync(join(dangling, 'src/security'), { recursive: true });
  symlinkSync(join(outside, 'new.ts'), join(dangling, 'src/security/rbac.ts'));
  assert.equal(sbd(['deploy', '--root', dangling]).code, 1, 'blocked');
  assert.ok(!existsSync(join(outside, 'new.ts')));

  const linkedDir = initialised();
  symlinkSync(outside, join(linkedDir, 'src/security'));
  assert.equal(sbd(['deploy', '--root', linkedDir, '--force']).code, 1, 'blocked');
  assert.deepEqual(readdirSync(outside), ['rbac.ts']);
});

test('a stack without templates is reported as a gap, not guessed', () => {
  const dir = initialised();
  const r = sbd(['deploy', '--root', dir, '--stack', 'typescript-nextjs', '--format', 'json']);
  assert.equal(r.code, 1);
  const p = JSON.parse(r.stdout);
  assert.ok(p.items.every((i) => i.state === 'no-template' && i.action === 'blocked'));
  assert.ok(!existsSync(join(dir, 'src/security')));
});

test('a stack id from a flag or the manifest cannot leave templates/', () => {
  const dir = initialised();
  assert.equal(sbd(['deploy', '--root', dir, '--stack', '../..']).code, 2);
  assert.equal(sbd(['plan', '--root', dir, '--stack', '../..']).code, 2);
  writeFileSync(join(dir, MANIFEST), read(dir, MANIFEST).replace('stack: typescript-express', 'stack: ../..'));
  assert.equal(sbd(['deploy', '--root', dir]).code, 2);
});

test('sbd plan and deploy read the stack from the manifest', () => {
  const dir = initialised();
  writeFileSync(join(dir, MANIFEST), read(dir, MANIFEST).replace('stack: typescript-express', 'stack: python-fastapi'));
  assert.ok(JSON.parse(sbd(['plan', '--root', dir]).stdout).every((i) => i.template.startsWith('templates/python-fastapi/')));
});

test('end to end: a sample Express repo reaches a clean plan with only the CLI', () => {
  const dir = sampleRepo();
  assert.equal(sbd(['init', '--non-interactive', '--root', dir, ...REGIMES]).code, 0);
  assert.equal(sbd(['validate', '--root', dir]).code, 0);
  const before = JSON.parse(sbd(['plan', '--root', dir]).stdout);
  assert.deepEqual(before.map((i) => i.status), ['missing', 'missing', 'missing']);
  assert.equal(sbd(['deploy', '--root', dir]).code, 0);
  const r = sbd(['plan', '--root', dir]);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout).map((i) => [i.target, i.status]), SCAFFOLDS.map((f) => [f, 'present']));
  const check = json(['check', '--root', dir]);
  assert.ok(!check.findings.some((f) => f.ruleId.startsWith('SBD-SCAF') || f.ruleId.startsWith('SBD-MANIFEST')));
});

test('every scaffold the rules require deploys once the user has classified their data', () => {
  const dir = sampleRepo();
  writeFileSync(join(dir, MANIFEST), `schemaVersion: "0.2"
product: { name: x, domain: healthcare, stack: typescript-express }
regimes: [{ id: nist-ssdf-1.1 }, { id: iso-27001-2022 }, { id: dpdp-2023 }]
dataCategories:
  - { name: c, sensitivity: sensitive-personal, fields: [email, dateOfBirth], retentionDays: 30, consentBasis: explicit, consentRequired: true, childrenDataPossible: true }
aiSystems:
  - { name: a, riskLevel: high, decisionAutonomy: advisory, humanOversight: review-mandatory, logDecisions: true }
`);
  const p = deploy(dir);
  assert.equal(p.written.length, 11);
  assert.ok(JSON.parse(sbd(['plan', '--root', dir]).stdout).every((i) => i.status === 'present'));
  rmSync(join(dir, 'src/privacy/consent.ts'));
  assert.deepEqual(deploy(dir).written, ['src/privacy/consent.ts'], 'a deleted scaffold comes back');
});
