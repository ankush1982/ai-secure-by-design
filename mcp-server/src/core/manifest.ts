// Manifest loading, schema validation, semantic checks and rule conditions.
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { formatErrors, loadRegimes, validator } from './load.js';
import type { Condition, Finding, Manifest } from './types.js';

export const DEFAULT_MANIFEST = 'privacy-security-manifest.yaml';

export interface ManifestLoad {
  manifest?: Manifest;
  findings: Finding[];
}

const ref = (control: string) => [{ regime: 'nist-ssdf-1.1', control }];

/** Reads and validates a manifest. Problems are returned as findings, never thrown. */
export function loadManifest(absPath: string, displayPath: string): ManifestLoad {
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch {
    return {
      findings: [{
        ruleId: 'SBD-MANIFEST-001',
        title: 'Manifest missing',
        severity: 'CRITICAL',
        message: `No manifest at ${displayPath}.`,
        remediation: 'Create one with the init prompt or from templates/privacy-security-manifest.example.yaml.',
        file: displayPath,
        regimes: ref('secure-sdlc'),
      }],
    };
  }
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (e) {
    return {
      findings: [{
        ruleId: 'SBD-MANIFEST-002',
        title: 'Manifest is not valid YAML',
        severity: 'CRITICAL',
        message: e instanceof Error ? e.message : String(e),
        file: displayPath,
        regimes: [],
      }],
    };
  }
  const v = validator('manifest');
  if (!v(data)) {
    return {
      findings: formatErrors(v.errors).map((msg) => ({
        ruleId: 'SBD-MANIFEST-003',
        title: 'Manifest fails schema',
        severity: 'HIGH' as const,
        message: `manifest.schema.json: ${msg}`,
        remediation: 'Fix the field; editors that read schemas/manifest.schema.json will autocomplete it.',
        file: displayPath,
        regimes: [],
      })),
    };
  }
  const manifest = data as Manifest;
  return { manifest, findings: semanticFindings(manifest, displayPath) };
}

function semanticFindings(m: Manifest, file: string): Finding[] {
  const out: Finding[] = [];
  const known = new Set(loadRegimes().map((r) => r.id));
  for (const r of m.regimes) {
    if (!known.has(r.id)) {
      out.push({
        ruleId: 'SBD-MANIFEST-004',
        title: 'Unknown regime',
        severity: 'MEDIUM',
        message: `Regime ${r.id} has no catalogue in regimes/; nothing will be checked for it.`,
        remediation: `Use one of: ${[...known].join(', ')}.`,
        file,
        regimes: [],
      });
    }
  }
  for (const c of m.dataCategories) {
    if (c.consentRequired === true && !c.retentionDays) {
      out.push({
        ruleId: 'SBD-MANIFEST-005',
        title: 'Retention period missing',
        severity: 'HIGH',
        message: `dataCategory ${c.name} has consentRequired: true but no retentionDays.`,
        remediation: 'Set retentionDays for the category.',
        file,
        regimes: [{ regime: 'dpdp-2023', control: 'retention' }, { regime: 'iso-27001-2022', control: 'information-deletion' }],
      });
    }
    if (c.childrenDataPossible === true && c.sensitivity === 'not-personal') {
      out.push({
        ruleId: 'SBD-MANIFEST-006',
        title: 'Likely misclassification',
        severity: 'MEDIUM',
        message: `dataCategory ${c.name} has childrenDataPossible: true but sensitivity: not-personal.`,
        file,
        regimes: [{ regime: 'dpdp-2023', control: 'children-data' }],
      });
    }
  }
  if (m.regimes.some((r) => r.id === 'dpdp-2023')) {
    for (const c of m.dataCategories) {
      if (c.consentBasis === 'contract') {
        out.push({
          ruleId: 'SBD-MANIFEST-008',
          title: 'No contract ground under DPDP',
          severity: 'MEDIUM',
          message: `dataCategory ${c.name} uses consentBasis: contract. DPDP Act 2023 s.7 lists specific legitimate uses and has no general contract ground.`,
          remediation: 'Use explicit (s.6 consent) or legitimate-use with the specific s.7 clause recorded in rationale, after checking with counsel.',
          file,
          regimes: [{ regime: 'dpdp-2023', control: 'legitimate-use' }],
        });
      }
    }
  }
  const categories = new Set(m.dataCategories.map((c) => c.name));
  for (const ai of m.aiSystems ?? []) {
    for (const ic of (ai.inputCategories as string[] | undefined) ?? []) {
      if (!categories.has(ic)) {
        out.push({
          ruleId: 'SBD-MANIFEST-007',
          title: 'Unknown input category',
          severity: 'LOW',
          message: `aiSystem ${ai.name} lists inputCategory ${ic}, which is not a dataCategory.`,
          file,
          regimes: [],
        });
      }
    }
  }
  return out;
}

const isPersonal = (s: string) => s === 'personal' || s === 'sensitive-personal';

/** Evaluates a rule condition against the manifest. Unknown conditions are false. */
export function holds(m: Manifest, cond: Condition): boolean {
  if (cond.startsWith('regime:')) return m.regimes.some((r) => r.id === cond.slice('regime:'.length));
  switch (cond) {
    case 'personalData':
      return m.dataCategories.some((c) => isPersonal(c.sensitivity));
    case 'sensitiveData':
      return m.dataCategories.some((c) => c.sensitivity === 'sensitive-personal');
    case 'childrenData':
      return m.dataCategories.some((c) => c.childrenDataPossible === true);
    case 'aiSystems':
      return (m.aiSystems ?? []).length > 0;
    case 'highRiskAi':
      return (m.aiSystems ?? []).some((a) => a.riskLevel === 'high');
    case 'humanOversight':
      return (m.aiSystems ?? []).some((a) => a.humanOversight !== undefined && a.humanOversight !== 'none');
    case 'healthcare': {
      const text = `${m.product.domain ?? ''} ${m.product.description ?? ''}`.toLowerCase();
      return /health|clinic|medical|patient|hospital/.test(text);
    }
    default:
      return false;
  }
}

/** Field names the manifest classifies as personal or sensitive. */
export function personalFields(m: Manifest): string[] {
  const set = new Set<string>();
  for (const c of m.dataCategories) {
    if (!isPersonal(c.sensitivity)) continue;
    for (const f of c.fields ?? []) set.add(f);
  }
  return [...set];
}

/** Every field the manifest classifies, in any category. */
export function classifiedFields(m: Manifest): Set<string> {
  const set = new Set<string>();
  for (const c of m.dataCategories) for (const f of c.fields ?? []) set.add(normaliseField(f));
  return set;
}

export const normaliseField = (f: string): string => f.toLowerCase().replace(/[_\-\s]/g, '');
