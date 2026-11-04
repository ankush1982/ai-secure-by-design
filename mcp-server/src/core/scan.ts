// Secret scanning over text. Shared by `sbd scan`, `sbd check`, the git hooks,
// the agent hooks and the MCP tool sbd_scan_text. Literal personal data is scanned the same
// way, so everything that blocks a secret also blocks it.
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

/** True if the line carries `sbd: ignore` (all rules) or `sbd: ignore SBD-CODE-001` (one rule). */
export function ignored(line: string, ruleId: string): boolean {
  const m = /\b(?:sbd|aiwiki):\s*ignore\b([A-Z0-9\-, ]*)/.exec(line);
  return !!m && (!m[1]!.trim() || m[1]!.includes(ruleId));
}

export function secretRules(): Rule[] {
  return loadRules().rules.filter((r) => r.kind === 'secret');
}

function piiRules(): Rule[] {
  return loadRules().rules.filter((r) => r.kind === 'pii');
}

export const SECRET_ALLOWLIST = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock)$|\.snap$|(^|\/)(__snapshots__|fixtures)\//;

/** Scans lines for secrets and literal personal data. Findings never re-leak the value. */
export function scanLines(lines: TextLine[], file?: string): Finding[] {
  return [...scanSecrets(lines, file), ...scanPii(lines, file)];
}

function scanSecrets(lines: TextLine[], file?: string): Finding[] {
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

const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml)$/;
const PLACEHOLDER_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|example|test|invalid|local|localhost|domain\.com|yourdomain\.com|test\.com|foo\.com|bar\.com)$/i;
const ROLE_MAILBOX = /^(no-?reply|do-?not-?reply|git|support|info|admin|hello|contact|sales|security|privacy|legal|help|team|dpo|abuse|postmaster|webmaster)$/i;
const FILE_SUFFIX = /\.(png|jpe?g|gif|svg|webp)$/i;

// The Verhoeff check digit that closes every Aadhaar number. The tables are not phone numbers.
const VERHOEFF_D = ['0123456789', '1234067895', '2340178956', '3401289567', '4012395678', '5987604321', '6598710432', '7659821043', '8765932104', '9876543210']; // sbd: ignore SBD-PII-003
const VERHOEFF_P = ['0123456789', '1576283094', '5803796142', '8916043527', '9453126870', '4286573901', '2793806415', '7046913258']; // sbd: ignore SBD-PII-003

function passesVerhoeff(digits: string): boolean {
  let c = 0;
  [...digits].reverse().forEach((d, i) => {
    c = Number(VERHOEFF_D[c]![Number(VERHOEFF_P[i % 8]![Number(d)])]);
  });
  return c === 0;
}

function isPlaceholderNumber(digits: string): boolean {
  return /^(\d)\1+$/.test(digits) || '0123456789'.includes(digits) || '9876543210'.includes(digits);
}

/** Named checks that keep a pattern match from being a false positive. */
const VALIDATORS: Record<NonNullable<Rule['validate']>, (value: string) => boolean> = {
  aadhaar: (v) => passesVerhoeff(v.replace(/\D/g, '')),
  'indian-mobile': (v) => !isPlaceholderNumber(v.replace(/\D/g, '').slice(-10)),
  email: (v) => {
    const [local, domain] = v.split('@') as [string, string];
    return !ROLE_MAILBOX.test(local) && !PLACEHOLDER_EMAIL_DOMAIN.test(domain) && !FILE_SUFFIX.test(domain);
  },
};

const STDIN = '<stdin>';

function scanPii(lines: TextLine[], file?: string): Finding[] {
  if (file && LOCKFILE.test(file)) return [];
  const name = file?.slice(file.lastIndexOf('/') + 1);
  const findings: Finding[] = [];
  for (const rule of piiRules()) {
    // Text with no file name, such as piped input, could be any kind of file.
    if (name && name !== STDIN && rule.files && !rule.files.some((s) => name.endsWith(s))) continue;
    const re = regex(rule.pattern!, `${rule.flags ?? ''}g`);
    const valid = rule.validate ? VALIDATORS[rule.validate] : () => true;
    for (const { line, text } of lines) {
      if (ignored(text, rule.id)) continue;
      if (![...text.matchAll(re)].some((m) => valid(m[0]))) continue;
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        message: rule.message ?? rule.title,
        remediation: rule.remediation,
        file,
        line,
        snippet: text.replace(re, (m) => '*'.repeat(m.length)).trim().slice(0, 200),
        regimes: rule.regimes ?? [],
      });
    }
  }
  return findings;
}

function mask(text: string, start: number, len: number): string {
  const keep = Math.min(4, len);
  const masked = text.slice(start, start + keep) + '*'.repeat(Math.max(0, len - keep));
  return (text.slice(0, start) + masked + text.slice(start + len)).trim().slice(0, 200);
}
