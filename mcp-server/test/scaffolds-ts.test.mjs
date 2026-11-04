// Runs the TypeScript scaffolds that have no framework dependency, laid out as /sbd-deploy
// lays them out, and bundled so that they share one audit_log.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { REPO, json } from './helpers.mjs';

const TEMPLATES = join(REPO, 'templates/typescript-express');
const ALL = ['src/privacy/consent', 'src/privacy/dsr_handler', 'src/privacy/retention_runner', 'src/privacy/children_gate', 'src/privacy/breach_notifier',
  'src/security/rbac', 'src/security/audit_log', 'src/security/security_headers', 'src/security/phi_redaction', 'src/ai/decision_log', 'src/ai/human_oversight'];

function deployed() {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-ts-'));
  for (const target of ALL) {
    mkdirSync(dirname(join(dir, target)), { recursive: true });
    copyFileSync(join(TEMPLATES, `${target.slice(target.lastIndexOf('/') + 1)}.ts`), join(dir, `${target}.ts`));
  }
  return dir;
}

let al, phi, dl, ho;
const audit = [];
const decisions = [];

before(async () => {
  const dir = deployed();
  writeFileSync(join(dir, 'entry.ts'), `
    export * as al from './src/security/audit_log';
    export * as phi from './src/security/phi_redaction';
    export * as dl from './src/ai/decision_log';
    export * as ho from './src/ai/human_oversight';
  `);
  const outfile = join(dir, 'bundle.mjs');
  await build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  ({ al, phi, dl, ho } = await import(pathToFileURL(outfile)));
  al.setAuditSink({ write: async (e) => void audit.push(e) });
  dl.setDecisionSink({ write: async (r) => void decisions.push(r) });
});

afterEach(() => {
  audit.length = 0;
  decisions.length = 0;
  al.configureRedaction([]);
});

const ctx = { systemName: 'triage', actor: 'svc', inputCategoryNames: ['c'] };

test('decision preview is redacted before it is cut', async () => {
  dl.setPreviewRedactor(al.redact);
  const email = 'someone.with.a.long.address@example.com';
  const output = `${'x'.repeat(190)} ${email}`;
  await dl.decisionLog(ctx, async () => output);
  const { outputPreview } = decisions[0];
  assert.equal(outputPreview.length, 200);
  assert.ok(!outputPreview.includes('someone'), outputPreview);
  assert.match(outputPreview, /pii:/);
});

test('a failed decision records a redacted error', async () => {
  await assert.rejects(dl.decisionLog(ctx, async () => { throw new Error('bad prompt for a@b.co'); }));
  assert.match(decisions[0].error, /^bad prompt for pii:/);
  assert.equal(audit[0].attrs.error, decisions[0].error);
  await assert.rejects(dl.decisionLog(ctx, async () => { throw new TypeError(''); }));
  assert.equal(decisions[1].error, 'TypeError');
});

test('phiRedact sends Error messages down the string path', () => {
  const cause = new Error('patient was seen');
  const copy = phi.phiRedact(new Error('lookup failed for a@b.co', { cause }));
  assert.match(copy.message, /^lookup failed for pii:/);
  assert.equal(copy.cause.message, '[PHI_REDACTED]');
  assert.equal(phi.phiRedact(new Error('patient has flu')).message, '[PHI_REDACTED]');
});

test('phiRedact applies configureRedaction field names, and clinical names win', () => {
  al.configureRedaction(['Phone', 'notes']);
  const out = phi.phiRedact({ phone: 'x', other: 'y', notes: 'z', rows: [{ PHONE: 1 }] });
  assert.match(out.phone, /^pii:/);
  assert.equal(out.other, 'y');
  assert.equal(out.notes, '[PHI_REDACTED]');
  assert.deepEqual(out.rows, [{ PHONE: '[REDACTED]' }]);
});

test('a modified review applies to plain objects and throws on anything else', async () => {
  ho.setOversightAdapter({
    requestReview: async () => ({ approver: 'dr', approverRole: 'physician', decision: 'modified', decidedAt: new Date(), modifications: { a: 2 } }),
  });
  assert.deepEqual((await ho.requirePhysicianReview('triage', { a: 1, b: 1 })).output, { a: 2, b: 1 });
  for (const output of ['text', 7, null, ['x'], new Date()]) {
    await assert.rejects(ho.requirePhysicianReview('triage', output), TypeError);
  }
});

test('deployed scaffolds trip no audit-log rule', () => {
  const dir = deployed();
  writeFileSync(join(dir, 'privacy-security-manifest.yaml'), 'schemaVersion: "0.2"\nproduct: { name: x }\nregimes:\n  - id: iso-27001-2022\ndataCategories: []\n');
  assert.deepEqual(json(['check', '--root', dir]).findings.filter((f) => f.ruleId === 'SBD-CODE-001'), []);
});

test('no TypeScript scaffold makes a compliance claim', () => {
  for (const f of readdirSync(TEMPLATES).filter((n) => n.endsWith('.ts'))) {
    assert.doesNotMatch(readFileSync(join(TEMPLATES, f), 'utf8'), /\b(compliant|satisfies|guarantees)\b/i, f);
  }
});
