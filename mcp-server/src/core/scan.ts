// Secret scanning over text. Shared by `sbd scan`, `sbd check`, the git hooks,
// the agent hooks and the MCP tool sbd_scan_text.
import { loadRules } from './load.js';
import type { Finding, Rule } from './types.js';

export interface TextLine {
  line: number;
  text: string;
}

const compiled = new Map<string, RegExp>();
export function regex(pattern: string, flags = ''): RegExp {
  const key = `${flags}/${pattern}`;
  let re = compiled.get(key);
  if (!re) {
    re = new RegExp(pattern, flags);
    compiled.set(key, re);
  }
  return re;
}

export function secretRules(): Rule[] {
  return loadRules().rules.filter((r) => r.kind === 'secret');
}

export const SECRET_ALLOWLIST = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock)$|\.snap$|(^|\/)(__snapshots__|fixtures)\//;

/** Scans lines for secrets. Snippets are masked so findings never re-leak the secret. */
export function scanLines(lines: TextLine[], file?: string): Finding[] {
  if (file && SECRET_ALLOWLIST.test(file)) return [];
  const findings: Finding[] = [];
  for (const rule of secretRules()) {
    const re = regex(rule.pattern!, rule.flags);
    for (const { line, text } of lines) {
      const m = re.exec(text);
      if (!m) continue;
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        message: rule.message ?? rule.title,
        remediation: rule.remediation,
        file,
        line,
        snippet: mask(text, m.index, m[0].length),
        regimes: rule.regimes ?? [],
      });
    }
  }
  return findings;
}

export function scanText(text: string, file?: string): Finding[] {
  return scanLines(text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t })), file);
}

function mask(text: string, start: number, len: number): string {
  const keep = Math.min(4, len);
  const masked = text.slice(start, start + keep) + '*'.repeat(Math.max(0, len - keep));
  return (text.slice(0, start) + masked + text.slice(start + len)).trim().slice(0, 200);
}
