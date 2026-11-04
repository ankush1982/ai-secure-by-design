import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
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

test('Claude PreToolUse adapter (engine path) blocks Write, Edit and MultiEdit, allows clean input', () => {
  const run = (tool_input) =>
    spawnSync(process.execPath, [join(REPO, 'hooks/pre-write-secret-scan.mjs')], {
      input: JSON.stringify({ tool_name: 'X', tool_input }),
      encoding: 'utf8',
    });
  assert.equal(run({ content: `k = "${FAKE.aws}"` }).status, 2);
  assert.equal(run({ new_string: FAKE.pem }).status, 2);
  assert.equal(run({ edits: [{ old_string: 'a', new_string: FAKE.aws }] }).status, 2);
  assert.equal(run({ content: 'const ok = process.env.KEY;' }).status, 0);
  assert.equal(spawnSync(process.execPath, [CLI, 'hook', 'claude-pretooluse'], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('Stop hook sends one JSON reminder on stdout, and nothing without a manifest or changes', () => {
  const stop = (cwd) => spawnSync(process.execPath, [join(REPO, 'hooks/session-end-summary.mjs')], { cwd, encoding: 'utf8' });
  const dir = tempFixture({ git: true });
  assert.equal(stop(dir).stdout, '');
  writeFileSync(join(dir, 'prisma/schema.prisma'), '// changed\n');
  const r = stop(dir);
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /schema changed but the manifest did not.*\/sbd-check/);
  rmSync(join(dir, 'privacy-security-manifest.yaml'));
  assert.equal(stop(dir).stdout, '');
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
  const staged = json(['check', '--root', dir, '--staged']).findings;
  assert.deepEqual(staged.map((f) => f.ruleId).sort(), ['SBD-CODE-001', 'SBD-CODE-002'], 'no project-wide or manifest findings in diff mode');
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-q', '--no-verify', '-m', 'x [human]'], { cwd: dir });
  const ranged = json(['check', '--root', dir, '--diff', 'HEAD~1...HEAD']).findings;
  assert.deepEqual(ranged.map((f) => f.line), staged.map((f) => f.line));
  assert.equal(sbd(['check', '--root', dir, '--diff=--output=x']).code, 2, 'ranges that look like git options are refused');
  // Touching the manifest brings its findings back.
  const mpath = join(dir, 'privacy-security-manifest.yaml');
  writeFileSync(mpath, readFileSync(mpath, 'utf8') + '# edit\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  assert.ok(json(['check', '--root', dir, '--staged']).findings.some((f) => f.ruleId === 'SBD-MANIFEST-008'));
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

function probe(files, regimes = 'iso-27001-2022') {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-pii-'));
  writeFileSync(join(dir, 'privacy-security-manifest.yaml'), `schemaVersion: "0.2"\nproduct: { name: x }\nregimes:\n  - id: ${regimes}\ndataCategories:\n  - { name: people, sensitivity: personal, fields: [email], consentRequired: false }\n`);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return json(['check', '--root', dir]).findings.filter((f) => !f.ruleId.startsWith('SBD-SCAF'));
}

// UIDAI's published sandbox number; the rest is assembled at run time, as with FAKE secrets.
const AADHAAR = ['9999', '9999', '0019'];
const PAN = 'ABCP' + 'D1234F';
const MOBILE = '98' + '12345678';
const EMAIL = 'jane.doe' + '@acme.in';

test('literal personal data is found, and the report never repeats it', () => {
  const found = probe({ 'src/a.ts': [
    `const a = "${AADHAAR.join(' ')}";`,
    `const b = "${AADHAAR.join('')}";`,
    `const p = "${PAN}";`,
    `const m = "+91 ${MOBILE}";`,
    `const n = "${MOBILE}";`,
    `const e = "${EMAIL}";`,
  ].join('\n') });
  assert.deepEqual(found.map((f) => [f.ruleId, f.line]), [
    ['SBD-PII-001', 1], ['SBD-PII-001', 2], ['SBD-PII-002', 3], ['SBD-PII-003', 4], ['SBD-PII-003', 5], ['SBD-PII-004', 6],
  ]);
  for (const f of found) {
    for (const value of [AADHAAR[0], PAN, MOBILE, EMAIL]) assert.ok(!f.snippet.includes(value), f.snippet);
  }
  assert.ok(found.every((f) => f.regimes.every((r) => r.regime === 'iso-27001-2022')), 'cites only the picked regime');
});

test('secrets and literal personal data block every path, whatever the file', () => {
  const value = `const e = "${EMAIL}";`;
  const scan = spawnSync(process.execPath, [CLI, 'scan', '--stdin'], { input: value, encoding: 'utf8' });
  assert.equal(scan.status, 1, 'scan --stdin blocks at the default level');
  assert.ok(!scan.stdout.includes(EMAIL));

  const edit = (file_path, content) => spawnSync(process.execPath, [join(REPO, 'hooks/pre-write-secret-scan.mjs')], {
    input: JSON.stringify({ tool_input: { file_path, content } }), encoding: 'utf8',
  });
  const blocked = edit('src/a.ts', `const p = "${PAN}";`);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /SBD-PII-002/);
  assert.ok(!blocked.stderr.includes(PAN));
  assert.equal(edit('docs/a.md', `Contact ${EMAIL}`).status, 0, 'emails in prose are not scanned');

  const dir = tempFixture({ git: true });
  writeFileSync(join(dir, 'src/seed.ts'), `const m = "+91 ${MOBILE}";\n`);
  execFileSync('git', ['add', '.'], { cwd: dir });
  assert.equal(sbd(['scan', '--staged', '--root', dir]).code, 1, 'staged scan blocks');
  rmSync(join(dir, 'privacy-security-manifest.yaml'));
  assert.equal(sbd(['scan', '--staged', '--root', dir]).code, 1, 'and needs no manifest');

  for (const file of ['rules/pii.yaml', 'rules/secrets.yaml']) {
    for (const rule of parse(readFileSync(join(REPO, file), 'utf8')).rules) {
      assert.ok(['CRITICAL', 'HIGH'].includes(rule.severity), `${rule.id} must block at --fail-on high`);
    }
  }
});

test('literal personal data checks skip look-alikes', () => {
  const found = probe({
    'src/a.ts': [
      'const notAadhaar = "2345 6789 0123";',          // fails the checksum
      `const card = "${AADHAAR.join(' ')} 4567";`,     // part of a longer number
      `const lower = "${PAN.toLowerCase()}";`,
      'const id = 9812345678;',                        // a bare number is not a phone
      'const fake = "9876543210";',
      'const same = "9999999999";',
      'const a = "jane@example.com";',
      'const b = "support@acme.in";',
      'const c = "git@github.com:org/repo.git";',
      'const d = "logo@2x.png";',
      `const reviewed = "${PAN}"; // sbd: ignore SBD-PII-002 sample from the spec`,
    ].join('\n'),
    'README.md': `Contact ${EMAIL}\n`,
    'package-lock.json': `{"pan": "${PAN}"}\n`,
    'package.json': `{"author": "${EMAIL}"}\n`,
  });
  assert.deepEqual(found, []);
});

test('whole request and user objects in logs are flagged, fields and redaction are not', () => {
  const flagged = [
    'console.log(req.body);',
    'console.log(user);',
    "console.log('saved', patient);",
    'console.error(JSON.stringify(req.body));',
    'logger.info({ user });',
    'console.log(`got ${user}`);',
    'print(request.headers)',
    'logging.info("body %s", await request.body())',
    'print(f"{user}")',
    'logger.info(patient.model_dump())',
  ];
  const clean = [
    "console.log('loaded user');",
    "console.log('user created', user.id);",
    'console.log(req.body.id);',
    'console.log(redact(req.body));',
    "logger.info('ok', phiRedact(patient));",
    'console.log(count);',
  ];
  const found = probe({ 'src/a.ts': [...flagged, ...clean].join('\n') }).filter((f) => f.ruleId === 'SBD-CODE-004');
  assert.deepEqual(found.map((f) => f.line), flagged.map((_, i) => i + 1));
});

test('health identifiers and clinical schema fields need classifying', () => {
  const names = ['mrn', 'bloodGroup', 'insurancePolicy', 'allergies', 'currentMedication', 'abhaNumber', 'uhid'];
  const prisma = `model P {\n  id Int @id\n${names.map((n) => `  ${n} String`).join('\n')}\n}\n`;
  const found = probe({ 'prisma/schema.prisma': prisma }).filter((f) => f.ruleId === 'SBD-FIELD-001');
  assert.equal(found.length, names.length);
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

test('every planned scaffold has the scaffolds it imports in the same plan', () => {
  const people = (sensitivity, extra = {}) => [{ name: 'people', sensitivity, ...extra }];
  const dpdp = [{ id: 'dpdp-2023' }];
  const other = [{ id: 'nist-ssdf-1.1' }];
  const ai = [{ name: 'triage', humanOversight: 'clinician-review' }];
  const manifests = {
    'dpdp, personal': { regimes: dpdp, dataCategories: people('personal') },
    'dpdp, sensitive and children': { regimes: dpdp, dataCategories: people('sensitive-personal', { childrenDataPossible: true }) },
    'dpdp, children on a not-personal category': { regimes: dpdp, dataCategories: people('not-personal', { childrenDataPossible: true }) },
    'healthcare, no scaffold regime': { product: { name: 'x', domain: 'healthcare' }, regimes: other, dataCategories: people('sensitive-personal') },
    'ai, no scaffold regime': { regimes: other, dataCategories: [], aiSystems: ai },
    'iso only': { regimes: [{ id: 'iso-27001-2022' }], dataCategories: [] },
  };
  for (const [label, manifest] of Object.entries(manifests)) {
    const dir = mkdtempSync(join(tmpdir(), 'sbd-plan-'));
    writeFileSync(join(dir, 'privacy-security-manifest.yaml'), stringify({ schemaVersion: '0.2', product: { name: 'x' }, ...manifest }));
    const items = JSON.parse(sbd(['plan', '--root', dir]).stdout);
    assert.ok(items.length > 0, label);
    const names = new Set(items.map((i) => i.target.replace(/^.*\/|\.ts$/g, '')));
    for (const item of items) {
      for (const [, name] of readFileSync(join(REPO, item.template), 'utf8').matchAll(/from '\.{1,2}\/(?:\w+\/)?(\w+)'/g)) {
        assert.ok(names.has(name), `${label}: ${item.target} imports ${name}, which is not planned`);
      }
    }
  }
});

test('findings cite only the regimes the manifest lists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-regimes-'));
  writeFileSync(join(dir, 'privacy-security-manifest.yaml'), stringify({
    schemaVersion: '0.2',
    product: { name: 'x' },
    regimes: [{ id: 'dpdp-2023' }],
    dataCategories: [{ name: 'people', sensitivity: 'personal' }],
  }));
  const { findings } = json(['check', '--root', dir]);
  const audit = findings.find((f) => f.ruleId === 'SBD-SCAF-007');
  assert.deepEqual(audit.regimes, [{ regime: 'dpdp-2023', control: 'data-fiduciary-duties' }]);
  assert.ok(findings.every((f) => f.regimes.every((g) => g.regime === 'dpdp-2023')));
});

test('explain and controls commands', () => {
  const ex = JSON.parse(sbd(['explain', 'iso-27001-2022', 'logging']).stdout);
  assert.ok(ex.checkedBy.some((r) => r.id === 'SBD-CODE-001'));
  assert.equal(sbd(['explain', 'iso-27001-2022', 'nope']).code, 2);
  assert.equal(JSON.parse(sbd(['controls']).stdout).length, 4);
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
