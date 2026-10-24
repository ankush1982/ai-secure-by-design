// SARIF 2.1.0 output, so findings show up in GitHub code scanning and other tools.
import { loadRules } from './load.js';
import type { CheckResult, Severity } from './types.js';

const LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
  INFO: 'note',
};

// GitHub code scanning reads security-severity (0.0–10.0) to rank alerts.
const SECURITY_SEVERITY: Record<Severity, string> = {
  CRITICAL: '9.5',
  HIGH: '8.0',
  MEDIUM: '5.5',
  LOW: '3.0',
  INFO: '0.0',
};

export function toSarif(r: CheckResult): object {
  const ruleMeta = new Map(loadRules().rules.map((x) => [x.id, x]));
  const ids = [...new Set(r.findings.map((f) => f.ruleId))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'sbd',
            version: r.tool.version,
            informationUri: 'https://github.com/ankush1982/ai-secure-by-design',
            rules: ids.map((id) => {
              const meta = ruleMeta.get(id);
              const sample = r.findings.find((f) => f.ruleId === id)!;
              return {
                id,
                name: (meta?.title ?? sample.title).replace(/[^A-Za-z0-9]+/g, ''),
                shortDescription: { text: meta?.title ?? sample.title },
                help: { text: meta?.remediation ?? sample.remediation ?? sample.message },
                defaultConfiguration: { level: LEVEL[meta?.severity ?? sample.severity] },
                properties: {
                  'security-severity': SECURITY_SEVERITY[meta?.severity ?? sample.severity],
                  tags: ['security', 'privacy', ...sample.regimes.map((g) => `${g.regime}/${g.control}`)],
                },
              };
            }),
          },
        },
        results: r.findings.map((f) => ({
          ruleId: f.ruleId,
          ruleIndex: index.get(f.ruleId),
          level: LEVEL[f.severity],
          message: { text: f.remediation ? `${f.message} ${f.remediation}` : f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.file ?? r.manifestPath },
                ...(f.line ? { region: { startLine: f.line } } : {}),
              },
            },
          ],
          properties: { severity: f.severity, regimes: f.regimes },
        })),
      },
    ],
  };
}
