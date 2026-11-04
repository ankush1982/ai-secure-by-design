#!/usr/bin/env node
// Generates the AI Security Wiki data the engine runs on, from a checkout of the wiki:
//   regimes/ai-security-wiki.yaml   the control library, as an opt-in regime
//   rules/ai-wiki.yaml              the toolkit's AIW-* rules, as engine rules
//
//   node scripts/sync-wiki.mjs ../AI-Security-Wiki
//
// Both files are CC BY-SA 4.0 (see NOTICE) and generated: edit the wiki, then re-run this.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const wiki = process.argv[2] && resolve(process.argv[2]);
if (!wiki) {
  console.error('usage: node scripts/sync-wiki.mjs <path to an AI-Security-Wiki checkout>');
  process.exit(2);
}

const SITE = 'https://nachi065.github.io/AI-Security-Wiki';
const LIBRARY = '03_Control_Library/03_AI_Security_Control_Objectives_Library';
const REGIME = 'ai-security-wiki';
const git = (...a) => execFileSync('git', ['-C', wiki, ...a], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short', 'HEAD');
const date = git('log', '-1', '--format=%cs');
const read = (rel) => readFileSync(join(wiki, 'source', rel), 'utf8');

/** RFC 4180 CSV to objects keyed by the header row. */
function csv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') cell += text[++i];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (rows.at(-1).push(cell), (cell = ''));
    else if (c === '\n') (rows.at(-1).push(cell.replace(/\r$/, '')), (cell = ''), rows.push([]));
    else cell += c;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Wiki links and bold markers mean nothing in a terminal or a SARIF message.
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/<br>/g, ' ').trim();

function controls() {
  const text = read(`${LIBRARY}.md`);
  const family = {};
  for (const [, name, ids] of text.matchAll(/^\| ([^|[]+?) \| ((?:\[AI-CTRL-\d{3}\]\(#ai-ctrl-\d{3}\)(?:, )?)+) \|$/gm)) {
    for (const [id] of ids.matchAll(/AI-CTRL-\d{3}/g)) family[id] = name;
  }
  const tests = {};
  for (const row of csv(read('25_Templates/data/test_cases.csv'))) {
    for (const [id] of row.Controls.matchAll(/AI-CTRL-\d{3}/g)) (tests[id] ??= []).push(row['Test Case ID']);
  }
  const out = [];
  for (const [, id, name, record] of text.matchAll(/^#### (AI-CTRL-\d{3}): (.+)\n([\s\S]*?)(?=^#### |^## |(?![\s\S]))/gm)) {
    const f = Object.fromEntries([...record.matchAll(/^\| \*\*([^*]+)\*\* \| (.*) \|$/gm)].map((m) => [m[1], plain(m[2])]));
    for (const k of ['Tier', 'Control Objective', 'Implementation Expectation', 'Evidence Required', 'Audit Test Procedure', 'Control Owner', 'Review Frequency']) {
      if (!f[k]) throw new Error(`${id} has no ${k} field`);
    }
    if (!family[id]) throw new Error(`${id} is not in the Control families table`);
    out.push({
      id,
      name,
      family: family[id],
      tier: f.Tier,
      description: `${name}: ${f['Control Objective']}`,
      implementation: f['Implementation Expectation'],
      // The wiki does not rank controls. Baseline controls come first, so they sort higher.
      severity: f.Tier === 'Baseline' ? 'HIGH' : 'MEDIUM',
      evidence: f['Evidence Required'],
      auditTest: f['Audit Test Procedure'],
      owner: f['Control Owner'],
      reviewFrequency: f['Review Frequency'],
      url: `${SITE}/${LIBRARY}.html#${id.toLowerCase()}`,
      risks: [...new Set(f['Risk Mapping']?.match(/AI-R\d+/g) ?? [])],
      testCases: (tests[id] ?? []).sort(),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function rules(ids) {
  const src = JSON.parse(read('24_Builder_Track/code/ai_rules.json'));
  const token = src.modelOutputTokens;
  return src.rules.map((r) => {
    for (const c of r.controls) if (!ids.has(c)) throw new Error(`${r.id} names unknown control ${c}`);
    const rule = { id: r.id, title: r.title, kind: r.kind === 'mcp' ? 'mcp-config' : 'code', severity: r.severity, when: [`regime:${REGIME}`] };
    if (r.files) rule.files = r.files;
    if (r.pattern) rule.pattern = r.pattern;
    if (r.mustAlsoMatch) rule.mustAlsoMatch = { pattern: r.mustAlsoMatch.replace('{{modelOutput}}', token), flags: 'i' };
    if (r.unlessLine) rule.unlessNearby = { pattern: r.unlessLine, before: 0, after: 0 };
    rule.regimes = r.controls.map((control) => ({ regime: REGIME, control }));
    rule.message = r.message;
    rule.remediation = `${r.remediation} Prove the fix with ${r.testCases.join(', ')}.`;
    return rule;
  });
}

const header = (what) =>
  `# GENERATED by scripts/sync-wiki.mjs from AI Security Wiki commit ${commit} (${date}). Do not edit by hand.\n` +
  `# ${what}\n` +
  `# Source: https://github.com/nachi065/AI-Security-Wiki\n` +
  `# (c) Nachiket Sathaye and Ankush Jain. Licensed CC BY-SA 4.0; this file was reformatted\n` +
  `# from the original. This file is not under the repository's Apache-2.0 licence: see NOTICE.\n\n`;

const list = controls();
const yaml = (data) => stringify(data, { lineWidth: 0, aliasDuplicateObjects: false });

writeFileSync(
  join(repo, 'regimes', `${REGIME}.yaml`),
  header('The wiki control library, as an opt-in regime.') +
    yaml({
      schemaVersion: '0.2',
      id: REGIME,
      name: 'AI Security Wiki control library',
      version: commit,
      publishedDate: date,
      scope:
        'AI-specific control objectives from the community AI Security Wiki, covering workforce AI use, runtime, agents, models, supply chain, ' +
        'governance and assurance. It is a practitioner reference, not a law or a certifiable standard. Severity here only reflects the wiki tier ' +
        '(Baseline as HIGH, Advanced as MEDIUM); the wiki does not rank controls.',
      controls: list,
    }),
);

writeFileSync(
  join(repo, 'rules', 'ai-wiki.yaml'),
  header('AI-specific code and configuration rules from the wiki Builder Toolkit (ai_rules.json).') +
    yaml({ schemaVersion: '0.2', rules: rules(new Set(list.map((c) => c.id))) }),
);

console.log(`synced ${list.length} controls and rules from ${commit} (${date})`);
