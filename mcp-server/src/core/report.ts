// Human-readable report, the format commands/sbd-check.md used to describe.
import type { CheckResult } from './types.js';

export function toText(r: CheckResult): string {
  const lines: string[] = ['secure-by-design check report', '============================='];
  lines.push(`Manifest: ${r.manifestPath}${r.manifest ? ` (schemaVersion ${r.manifest.schemaVersion})` : ''}`);
  if (r.manifest) lines.push(`Regimes:  ${r.manifest.regimes.join(', ')}`);
  lines.push('');
  if (r.findings.length === 0) {
    lines.push('No findings.');
    return lines.join('\n');
  }
  r.findings.forEach((f, i) => {
    const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ''} — ` : '';
    lines.push(`${String(i + 1).padStart(3)}. [${f.severity}] ${f.ruleId} ${where}${f.message}`);
    if (f.snippet) lines.push(`       ${f.snippet}`);
    if (f.remediation) lines.push(`       → ${f.remediation}`);
  });
  const s = r.summary;
  lines.push('', `${s.total} finding(s): ${s.CRITICAL} critical, ${s.HIGH} high, ${s.MEDIUM} medium, ${s.LOW} low, ${s.INFO} info.`);
  lines.push('This report lists control gaps. It is not a compliance determination.');
  return lines.join('\n');
}
