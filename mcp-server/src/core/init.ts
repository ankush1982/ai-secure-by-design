// `sbd init --non-interactive`: a draft manifest from what can be detected. Stack and
// candidate fields are facts about the repo. Classification and regime choice are the
// user's, so fields appear only as comments and regimes only when passed in.
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { unclassifiedFields, type FieldCandidate } from './check.js';
import { listFiles } from './files.js';
import { loadRegimes } from './load.js';
import { DEFAULT_MANIFEST } from './manifest.js';
import { confine, resolvesInside, toPosix } from './paths.js';
import { checkStack, detectStack, type StackDetection } from './stack.js';
import { VERSION } from './version.js';

export interface InitOptions {
  root: string;
  manifestPath?: string;
  /** Regimes the user chose. Never filled in by the engine. */
  regimes?: string[];
  /** The user's choice of stack. Overrides detection. */
  stack?: string;
}

export interface InitPlan {
  manifestPath: string;
  action: 'create' | 'skip';
  reason?: string;
  product: string;
  stack: StackDetection;
  regimes: string[];
  candidateFields: FieldCandidate[];
  todos: number;
  /** The file `sbd init` would write. Absent when a manifest already exists. */
  draft?: string;
}

function productName(root: string): string {
  try {
    const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
    if (typeof name === 'string' && name) return name;
  } catch {
    // no package.json: fall back to the directory name
  }
  return basename(root) || 'product';
}

// Repo-derived text goes into comments, so a newline must not be able to end the comment.
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

function exists(abs: string): boolean {
  try {
    lstatSync(abs); // not existsSync: a dangling symlink still occupies the path
    return true;
  } catch {
    return false;
  }
}

function stackFor(opts: InitOptions): StackDetection {
  const found = detectStack(opts.root);
  if (opts.stack === undefined) return found;
  return { ...found, stack: checkStack(opts.stack), candidates: [opts.stack], evidence: ['--stack'] };
}

function checkRegimes(regimes: string[]): string[] {
  const known = loadRegimes().map((r) => r.id);
  for (const r of regimes) {
    if (!known.includes(r)) throw new Error(`unknown regime ${r}; available: ${known.join(', ')}`);
  }
  return [...new Set(regimes)];
}

function renderDraft(p: Pick<InitPlan, 'product' | 'stack' | 'regimes' | 'candidateFields'>): string {
  const { stack } = p;
  const out = [
    '# privacy-security-manifest.yaml: draft written by `sbd init --non-interactive`.',
    '# Nothing here is decided for you. Work through every TODO(user): marker, then run `sbd validate`.',
    '# This file records your declarations. It is not a compliance determination.',
    '# Reference: schemas/manifest.schema.json',
    '',
    'schemaVersion: "0.2"',
    '',
    'product:',
    `  name: ${JSON.stringify(p.product)}  # TODO(user): confirm the product name`,
  ];
  if (stack.stack) {
    out.push(`  stack: ${stack.stack}  # from: ${oneLine(stack.evidence.join(', '))}`);
  } else if (stack.candidates.length) {
    out.push(`  # TODO(user): stack: pick one of ${stack.candidates.join(', ')} (${oneLine(stack.evidence.join(', '))})`);
  } else {
    out.push('  # TODO(user): stack: no supported stack detected; see templates/ for the ones with scaffolds');
  }
  for (const note of stack.notes) out.push(`  # TODO(user): ${oneLine(note)}`);
  out.push(
    '  # TODO(user): description: what the product does, in a sentence or two',
    '  # TODO(user): domain: e.g. healthcare (decides the healthcare-only scaffolds)',
    '  # TODO(user): region: IN | EU | US | GLOBAL',
    '  # TODO(user): deploymentMode: saas | self-hosted | on-prem | air-gapped',
    '',
  );

  if (p.regimes.length) {
    out.push('regimes:');
    for (const id of p.regimes) out.push(`  - id: ${id}`, '    # TODO(user): scope: what this regime covers in this product');
  } else {
    out.push(
      `# TODO(user): choose the regimes you target. Available: ${loadRegimes().map((r) => r.id).join(', ')}.`,
      '# Add entries such as `- id: nist-ssdf-1.1`, or pass --regime to sbd init. `sbd controls --regime ID` lists a catalogue.',
      '# Until you choose, `sbd validate`, `sbd plan` and `sbd deploy` stop with a schema error. That is deliberate.',
      'regimes: []',
    );
  }
  out.push('');

  out.push(
    '# TODO(user): declare a category for the data this product handles. Each one needs a name and a',
    '# sensitivity of not-personal, personal or sensitive-personal, plus its fields, retentionDays and consentBasis.',
  );
  if (p.candidateFields.length) {
    out.push('# These fields look personal to the engine. They are candidates, not classifications:');
    for (const f of p.candidateFields) out.push(`#   TODO(user): classify ${f.name} (${oneLine(f.file)}:${f.line})`);
  }
  out.push('dataCategories: []', '');

  if (stack.aiSdks.length) {
    out.push(`# TODO(user): AI SDKs found (${oneLine(stack.aiSdks.join(', '))}). If they are used, declare each system: name, riskLevel, decisionAutonomy, humanOversight.`);
  }
  out.push('aiSystems: []', '', 'manifest:', `  generatedBy: sbd init ${VERSION}`, '');
  return out.join('\n');
}

/** What `sbd init` would write. Reads the repo, writes nothing. */
export function planInit(opts: InitOptions): InitPlan {
  const manifestPath = toPosix(opts.manifestPath ?? DEFAULT_MANIFEST);
  const abs = confine(opts.root, manifestPath);
  const base = {
    manifestPath,
    product: productName(opts.root),
    stack: stackFor(opts),
    regimes: checkRegimes(opts.regimes ?? []),
    candidateFields: unclassifiedFields(opts.root, listFiles(opts.root), new Set()),
  };
  if (exists(abs)) return { ...base, action: 'skip', reason: `${manifestPath} already exists`, todos: 0 };
  if (!resolvesInside(opts.root, manifestPath)) throw new Error(`${manifestPath} resolves outside the workspace root`);
  const draft = renderDraft(base);
  return { ...base, action: 'create', todos: draft.split('TODO(user):').length - 1, draft };
}

/** Writes the draft. The exclusive open means an existing manifest can never be replaced. */
export function applyInit(root: string, plan: InitPlan): void {
  if (plan.action !== 'create' || plan.draft === undefined) return;
  const abs = confine(root, plan.manifestPath);
  mkdirSync(dirname(abs), { recursive: true });
  const fd = openSync(abs, 'wx');
  try {
    writeSync(fd, plan.draft);
  } finally {
    closeSync(fd);
  }
}

export function initText(p: InitPlan, dryRun: boolean): string {
  if (p.action === 'skip') return `${p.reason}; nothing written.`;
  const lines = [
    `${dryRun ? 'Would write' : 'Wrote'} ${p.manifestPath} (draft, ${p.todos} TODO(user): markers).`,
    `Stack: ${p.stack.stack ?? (p.stack.candidates.length ? `ambiguous (${p.stack.candidates.join(', ')})` : 'not detected')}`,
    `Regimes: ${p.regimes.length ? p.regimes.join(', ') : 'none chosen'}`,
    `Personal-looking fields to classify: ${p.candidateFields.length}`,
    '',
    'Next:',
    '  1. Resolve the TODO(user): markers. Regimes and classification are your decisions.',
    '  2. sbd validate',
    '  3. sbd deploy --dry-run, then sbd deploy',
  ];
  return lines.join('\n');
}
