// `sbd check`: the deterministic replacement for the prose in commands/sbd-check.md.
// Same input, same findings, on every platform.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rangeAdded, stagedAdded, type AddedLines } from './diff.js';
import { extractFields, fieldWords, isSchemaFile } from './fields.js';
import { listFiles, readText } from './files.js';
import { loadRules } from './load.js';
import { classifiedFields, DEFAULT_MANIFEST, holds, loadManifest, normaliseField, personalFields } from './manifest.js';
import { confine, toPosix } from './paths.js';
import { isMcpConfig, scanMcpConfig } from './mcp-config.js';
import { ignored, regex, scanText } from './scan.js';
import { detectStack } from './stack.js';
import { SEVERITY_ORDER, WIKI_REGIME, type CheckResult, type Condition, type Finding, type Manifest, type Rule, type Severity } from './types.js';
import { VERSION } from './version.js';

export interface CheckOptions {
  root: string;
  manifestPath?: string;
  /** Only report findings on lines added in this git range (e.g. origin/main...HEAD). */
  diff?: string;
  /** Only report findings on lines added in the git index. */
  staged?: boolean;
}

const SCAFFOLD_EXTS = ['.ts', '.tsx', '.js', '.mjs', '.py'];
export const DEFAULT_STACK = 'typescript-express';

export function runCheck(opts: CheckOptions): CheckResult {
  const root = opts.root;
  const manifestRel = toPosix(opts.manifestPath ?? DEFAULT_MANIFEST);
  const loaded = loadManifest(confine(root, manifestRel), manifestRel);
  const findings: Finding[] = [...loaded.findings];
  const m = loaded.manifest;

  if (m) {
    const added: AddedLines | undefined = opts.diff ? rangeAdded(root, opts.diff) : opts.staged ? stagedAdded(root) : undefined;
    const files = added ? [...added.keys()].filter((f) => existsSync(join(root, f))) : listFiles(root);
    const lineFindings = [...scanFiles(root, files, m), ...fieldFindings(root, files, m)];
    if (!added) {
      findings.push(...lineFindings, ...scaffoldFindings(root, m));
    } else {
      // Diff mode gates the change, not the whole project: keep findings on added lines,
      // and manifest findings only when the change touches the manifest. Project-wide
      // gaps (missing scaffolds) are reported by a full `sbd check`.
      findings.push(...lineFindings.filter((f) => onAddedLine(f, added)));
      if (!added.has(manifestRel)) findings.splice(0, loaded.findings.length);
    }
  }

  return result(root, manifestRel, m, findings);
}

function onAddedLine(f: Finding, added: AddedLines): boolean {
  if (!f.file || !f.line) return false;
  return (added.get(f.file) ?? []).some((l) => l.line === f.line);
}

export function applicable(rule: Rule, m: Manifest): boolean {
  const all = (conditions: Condition[]) => conditions.every((c) => holds(m, c));
  return all(rule.when ?? []) && (rule.whenAny?.some(all) ?? true);
}

function effectiveSeverity(rule: Rule, m: Manifest): Severity {
  let sev = rule.severity;
  for (const s of rule.severityWhen ?? []) {
    if (holds(m, s.condition) && SEVERITY_ORDER.indexOf(s.severity) > SEVERITY_ORDER.indexOf(sev)) sev = s.severity;
  }
  return sev;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scanFiles(root: string, files: string[], m: Manifest): Finding[] {
  const { rules } = loadRules();
  const codeRules = rules.filter((r) => r.kind === 'code' && applicable(r, m));
  const mcpRules = rules.filter((r) => r.kind === 'mcp-config' && applicable(r, m));
  const fields = personalFields(m);
  const out: Finding[] = [];
  for (const file of files) {
    const text = readText(join(root, file));
    if (text === undefined) continue;
    out.push(...scanText(text, file));
    if (mcpRules.length && isMcpConfig(file, text)) out.push(...scanMcpConfig(text, file, mcpRules));
    const name = file.slice(file.lastIndexOf('/') + 1);
    const lines = text.split(/\r?\n/);
    for (const rule of codeRules) {
      if (rule.files && !rule.files.some((s) => name.endsWith(s))) continue;
      let also: RegExp | undefined;
      if (rule.mustAlsoMatch) {
        if (rule.mustAlsoMatch.pattern.includes('{{personalFields}}') && fields.length === 0) continue;
        also = regex(rule.mustAlsoMatch.pattern.replace('{{personalFields}}', fields.map(escapeRe).join('|')), rule.mustAlsoMatch.flags);
      }
      const re = regex(rule.pattern!, rule.flags);
      const unless = rule.unlessNearby ? regex(rule.unlessNearby.pattern, rule.unlessNearby.flags) : undefined;
      lines.forEach((text, i) => {
        if (!re.test(text)) return;
        if (also && !also.test(text)) return;
        if (ignored(text, rule.id)) return;
        if (unless) {
          // The window stops at the next line the rule itself matches, so a log call in
          // the following handler cannot excuse this one.
          const from = Math.max(0, i - (rule.unlessNearby!.before ?? 0));
          let to = Math.min(lines.length, i + (rule.unlessNearby!.after ?? 0) + 1);
          for (let j = i + 1; j < to; j++) if (re.test(lines[j]!)) to = j;
          if (lines.slice(from, to).some((l) => unless.test(l))) return;
        }
        out.push({
          ruleId: rule.id,
          title: rule.title,
          severity: effectiveSeverity(rule, m),
          message: rule.message ?? rule.title,
          remediation: rule.remediation,
          file,
          line: i + 1,
          snippet: text.trim().slice(0, 200),
          regimes: rule.regimes ?? [],
        });
      });
    }
  }
  return out;
}

export interface FieldCandidate {
  name: string;
  file: string;
  line: number;
}

/** Personal-looking schema fields outside `classified`. Candidates only; the user classifies. */
export function unclassifiedFields(root: string, files: string[], classified: Set<string>): FieldCandidate[] {
  const spec = loadRules().personalFields;
  const tokens = new Set(spec.tokens);
  const exact = new Set(spec.exactOnly ?? []);
  const out: FieldCandidate[] = [];
  const seen = new Set<string>();
  for (const file of files.filter(isSchemaFile)) {
    const text = readText(join(root, file));
    if (text === undefined) continue;
    for (const hit of extractFields(file, text)) {
      const norm = normaliseField(hit.name);
      if (classified.has(norm)) continue;
      const looksPersonal = exact.has(norm) || tokens.has(norm) || fieldWords(hit.name).some((w) => tokens.has(w));
      if (!looksPersonal) continue;
      const key = `${file}:${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: hit.name, file, line: hit.line });
    }
  }
  return out;
}

function fieldFindings(root: string, files: string[], m: Manifest): Finding[] {
  const spec = loadRules().personalFields;
  return unclassifiedFields(root, files, classifiedFields(m)).map((c) => ({
    ruleId: spec.ruleId,
    title: 'Unclassified personal-looking field',
    severity: spec.severity,
    message: `Field ${c.name} looks personal or sensitive but no dataCategory lists it.`,
    remediation: 'Add it to the right dataCategories[].fields in the manifest (or to a not-personal category). Classification is your call; the tool never classifies for you.',
    file: c.file,
    line: c.line,
    regimes: spec.regimes ?? [],
  }));
}

export function scaffoldCandidates(rule: Rule): string[] {
  const names = new Set([rule.name!, rule.name!.replace(/_/g, '-')]);
  return [...names].flatMap((n) => SCAFFOLD_EXTS.map((e) => `${rule.dir}/${n}${e}`));
}

/** Where a scaffold's template and deployed file live for a stack; undefined for an unknown stack. */
export function scaffoldFiles(rule: Rule, stack: string): { template: string; target: string } | undefined {
  const { stacks } = loadRules();
  const ext = Object.hasOwn(stacks, stack) ? stacks[stack] : undefined;
  return ext ? { template: `templates/${stack}/${rule.template}${ext}`, target: `${rule.dir}/${rule.name}${ext}` } : undefined;
}

function scaffoldFindings(root: string, m: Manifest): Finding[] {
  const out: Finding[] = [];
  const stack = m.product.stack ?? detectStack(root).stack ?? DEFAULT_STACK;
  for (const rule of loadRules().rules.filter((r) => r.kind === 'scaffold' && applicable(r, m))) {
    const candidates = scaffoldCandidates(rule);
    if (candidates.some((c) => existsSync(join(root, c)))) continue;
    const files = scaffoldFiles(rule, stack);
    out.push({
      ruleId: rule.id,
      title: `Missing scaffold: ${rule.title}`,
      severity: effectiveSeverity(rule, m),
      message: `Missing ${rule.dir}/${rule.name}.<ext> (${rule.title}).`,
      remediation: files
        ? `Copy ${files.template} to ${files.target}, or run \`sbd deploy\`.`
        : `No templates for stack ${stack}; add ${rule.dir}/${rule.name}.<ext> yourself.`,
      regimes: rule.regimes ?? [],
    });
  }
  return out;
}

export function summarise(findings: Finding[]): CheckResult['summary'] {
  const s = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, total: findings.length };
  for (const f of findings) s[f.severity]++;
  return s;
}

const SORT = (a: Finding, b: Finding) =>
  SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity) ||
  (a.file ?? '').localeCompare(b.file ?? '') ||
  (a.line ?? 0) - (b.line ?? 0) ||
  a.ruleId.localeCompare(b.ruleId);

export function result(root: string, manifestPath: string, m: Manifest | undefined, findings: Finding[]): CheckResult {
  findings.sort(SORT);
  // A regime is cited only if the user picked it. With no manifest there is no pick to go
  // by, so the catalogue tags stay and only the wiki, which is always opt-in, goes.
  const picked = new Set(m?.regimes.map((r) => r.id));
  const shown = (regime: string) => (m ? picked.has(regime) : regime !== WIKI_REGIME);
  for (const f of findings) f.regimes = f.regimes.filter((g) => shown(g.regime));
  return {
    tool: { name: 'sbd', version: VERSION },
    root,
    manifestPath,
    manifest: m && {
      product: m.product.name,
      schemaVersion: String(m.schemaVersion),
      regimes: m.regimes.map((r) => r.id),
    },
    findings,
    summary: summarise(findings),
  };
}
