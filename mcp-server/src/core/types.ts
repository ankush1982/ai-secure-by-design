// Shared types for the sbd engine. Everything the CLI, MCP server and hooks report
// is a Finding, so every adapter returns identical results for identical input.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export const SEVERITY_ORDER: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function severityAtLeast(s: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER.indexOf(s) >= SEVERITY_ORDER.indexOf(threshold);
}

export interface RegimeRef {
  regime: string;
  control: string;
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  message: string;
  remediation?: string;
  file?: string; // repo-relative, forward slashes
  line?: number; // 1-based
  snippet?: string;
  regimes: RegimeRef[];
}

export type Condition = string;

export interface RegexSpec {
  pattern: string;
  flags?: string;
  before?: number;
  after?: number;
}

export interface Rule {
  id: string;
  title: string;
  kind: 'secret' | 'code' | 'scaffold';
  severity: Severity;
  severityWhen?: Array<{ condition: Condition; severity: Severity }>;
  when?: Condition[];
  files?: string[];
  pattern?: string;
  flags?: string;
  mustAlsoMatch?: RegexSpec;
  unlessNearby?: RegexSpec;
  dir?: string;
  name?: string;
  template?: string;
  regimes?: RegimeRef[];
  message?: string;
  remediation?: string;
}

export interface PersonalFieldsSpec {
  ruleId: string;
  severity: Severity;
  regimes?: RegimeRef[];
  tokens: string[];
  exactOnly?: string[];
}

export interface RegimeControl {
  id: string;
  section?: string;
  annexA?: string[];
  practices?: string[];
  description: string;
  implementation: string;
  severity: Severity;
}

export interface Regime {
  schemaVersion?: string;
  id: string;
  name: string;
  version: string;
  publishedDate?: string;
  scope: string;
  controls: RegimeControl[];
}

export interface DataCategory {
  name: string;
  sensitivity: 'not-personal' | 'personal' | 'sensitive-personal';
  fields?: string[];
  storedIn?: string[];
  retentionDays?: number | null;
  consentRequired?: boolean;
  consentBasis?: string;
  childrenDataPossible?: boolean;
  [k: string]: unknown;
}

export interface AiSystem {
  name: string;
  riskLevel?: string;
  decisionAutonomy?: string;
  humanOversight?: string;
  logDecisions?: boolean;
  [k: string]: unknown;
}

export interface Manifest {
  schemaVersion: string | number;
  product: { name: string; domain?: string; description?: string; stack?: string; [k: string]: unknown };
  regimes: Array<{ id: string; [k: string]: unknown }>;
  dataCategories: DataCategory[];
  aiSystems?: AiSystem[];
  [k: string]: unknown;
}

export interface CheckResult {
  tool: { name: 'sbd'; version: string };
  root: string;
  manifestPath: string;
  manifest?: { product: string; schemaVersion: string; regimes: string[] };
  findings: Finding[];
  summary: Record<Severity, number> & { total: number };
}
