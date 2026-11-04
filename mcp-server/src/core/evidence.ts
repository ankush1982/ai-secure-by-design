// `sbd evidence`: joins the wiki control library with this project's check results, so a
// team can see which controls the tool can check, what it found, and what an auditor would
// still ask for. It reports what was observed, never a verdict: Result stays blank for a
// reviewer, and "checked" only means the automated checks found nothing.
import { createHash } from 'node:crypto';
import { applicable, runCheck, type CheckOptions } from './check.js';
import { loadRegimes, loadRules } from './load.js';
import { DEFAULT_MANIFEST, holds, loadManifest } from './manifest.js';
import { confine } from './paths.js';
import { WIKI_REGIME, type Finding, type RegimeRef } from './types.js';
import { VERSION } from './version.js';

export type EvidenceStatus = 'gap' | 'checked' | 'manual';

export interface EvidenceRow {
  id: string;
  name: string;
  family: string;
  tier: string;
  owner: string;
  reviewFrequency: string;
  evidence: string;
  auditTest: string;
  url: string;
  status: EvidenceStatus;
  checks: string[];
  openFindings: Array<{ ruleId: string; file?: string; line?: number }>;
  testCases: string[];
}

export interface EvidencePlan {
  product: string;
  source: { regime: string; version: string; publishedDate?: string };
  wikiRegimeSelected: boolean;
  evidenceRef: string;
  summary: Record<EvidenceStatus, number> & { total: number };
  controls: EvidenceRow[];
  note: string;
}

const NOTE = 'gap = an automated check found a problem. checked = the automated checks found nothing, which does not show the control is effective. ' +
  'manual = nothing here can check it. Every control still needs its evidence reviewed by a person. This is not a compliance determination.';

export function evidencePlan(opts: CheckOptions & { tier?: string }): EvidencePlan {
  const rel = opts.manifestPath ?? DEFAULT_MANIFEST;
  const { manifest: m } = loadManifest(confine(opts.root, rel), rel);
  if (!m) throw new Error(`no valid manifest at ${rel}; run sbd validate`);
  const regime = loadRegimes().find((r) => r.id === WIKI_REGIME);
  if (!regime) throw new Error(`regimes/${WIKI_REGIME}.yaml missing`);

  const { rules, personalFields } = loadRules();
  const refs = new Map<string, RegimeRef[]>(rules.filter((r) => applicable(r, m)).map((r) => [r.id, r.regimes ?? []]));
  refs.set(personalFields.ruleId, personalFields.regimes ?? []);
  const checksFor = (id: string) => [...refs].filter(([, g]) => g.some((x) => x.regime === WIKI_REGIME && x.control === id)).map(([r]) => r).sort();

  const check = runCheck({ root: opts.root, manifestPath: opts.manifestPath });
  const open = (ids: string[]): Finding[] => check.findings.filter((f) => ids.includes(f.ruleId));
  const hash = createHash('sha256').update(JSON.stringify(check.findings)).digest('hex').slice(0, 12);

  const controls = regime.controls
    .filter((c) => !opts.tier || c.tier?.toLowerCase() === opts.tier.toLowerCase())
    .map((c): EvidenceRow => {
      const checks = checksFor(c.id);
      const hits = open(checks);
      return {
        id: c.id,
        name: c.name ?? c.id,
        family: c.family ?? '',
        tier: c.tier ?? '',
        owner: c.owner ?? '',
        reviewFrequency: c.reviewFrequency ?? '',
        evidence: c.evidence ?? '',
        auditTest: c.auditTest ?? '',
        url: c.url ?? '',
        status: hits.length ? 'gap' : checks.length ? 'checked' : 'manual',
        checks,
        openFindings: hits.map((f) => ({ ruleId: f.ruleId, file: f.file, line: f.line })),
        testCases: c.testCases ?? [],
      };
    });
  const count = (s: EvidenceStatus) => controls.filter((c) => c.status === s).length;
  return {
    product: m.product.name,
    source: { regime: WIKI_REGIME, version: regime.version, publishedDate: regime.publishedDate },
    wikiRegimeSelected: holds(m, `regime:${WIKI_REGIME}`),
    evidenceRef: `sbd ${VERSION} check sha256:${hash}`,
    summary: { gap: count('gap'), checked: count('checked'), manual: count('manual'), total: controls.length },
    controls,
    note: NOTE,
  };
}

const notes = (c: EvidenceRow): string => {
  if (c.status === 'manual') return 'No automated check. Collect the evidence by hand.';
  const where = c.openFindings.slice(0, 5).map((f) => `${f.ruleId}${f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : ''}`);
  const more = c.openFindings.length > 5 ? ` and ${c.openFindings.length - 5} more` : '';
  return c.status === 'gap' ? `Open: ${where.join('; ')}${more}.` : `No findings from ${c.checks.join(', ')}.`;
};

const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The Controls sheet columns of the wiki's Audit and Evidence Checklist workbook. */
export function evidenceCsv(p: EvidencePlan, date = new Date().toISOString().slice(0, 10)): string {
  const rows = [['Control ID', 'Control', 'Result', 'Evidence Ref', 'Evidence Collection Date', 'Auditor Notes']];
  for (const c of p.controls) rows.push([c.id, c.name, '', c.status === 'manual' ? '' : p.evidenceRef, c.status === 'manual' ? '' : date, notes(c)]);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

const row = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function evidenceMarkdown(p: EvidencePlan): string {
  const out = [`# Audit evidence plan: ${p.product}`, '', `Controls from the AI Security Wiki at ${p.source.version}. Reference: \`${p.evidenceRef}\`.`, '', `> ${p.note}`, ''];
  for (const family of [...new Set(p.controls.map((c) => c.family))]) {
    out.push(`## ${family}`, '', '| Control | Tier | Status | What the tool saw | Evidence to collect | Audit test | Owner | Review |', '|---|---|---|---|---|---|---|---|');
    for (const c of p.controls.filter((x) => x.family === family)) {
      out.push(`| [${c.id}](${c.url}) ${row(c.name)} | ${c.tier} | ${c.status} | ${row(notes(c))} | ${row(c.evidence)} | ${row(c.auditTest)} | ${row(c.owner)} | ${row(c.reviewFrequency)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

export function evidenceText(p: EvidencePlan): string {
  const s = p.summary;
  const lines = [`audit evidence plan: ${p.product}`, `${s.total} wiki controls (${p.source.version}): ${s.gap} gap, ${s.checked} checked, ${s.manual} manual`, ''];
  for (const c of p.controls.filter((x) => x.status === 'gap')) lines.push(`  gap      ${c.id} ${c.name}: ${notes(c)}`);
  for (const c of p.controls.filter((x) => x.status === 'checked')) lines.push(`  checked  ${c.id} ${c.name}: ${notes(c)}`);
  if (!p.wikiRegimeSelected) lines.push('', `Add "- id: ${WIKI_REGIME}" under regimes: in the manifest to run the AI-specific AIW-* rules too.`);
  lines.push('', p.note, 'Use --format markdown for the evidence and audit test per control, or csv for the wiki workbook.');
  return lines.join('\n');
}
