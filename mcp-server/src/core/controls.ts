// Regime catalogue queries and scaffold planning (read-only).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldCandidates } from './check.js';
import { assetPath } from './assets.js';
import { loadRegimes, loadRules } from './load.js';
import { holds } from './manifest.js';
import type { Manifest, RegimeControl } from './types.js';

export function listControls(regime = 'all'): Array<{ id: string; name: string; controls: RegimeControl[] }> {
  return loadRegimes()
    .filter((r) => regime === 'all' || r.id === regime)
    .map((r) => ({ id: r.id, name: r.name, controls: r.controls }));
}

export function explainControl(regime: string, control: string): object | undefined {
  const r = loadRegimes().find((x) => x.id === regime);
  const c = r?.controls.find((x) => x.id === control);
  if (!r || !c) return undefined;
  const rules = loadRules().rules
    .filter((x) => (x.regimes ?? []).some((g) => g.regime === regime && g.control === control))
    .map((x) => ({ id: x.id, title: x.title, kind: x.kind, severity: x.severity }));
  return { regime: { id: r.id, name: r.name, version: r.version }, control: c, checkedBy: rules, disclaimer: "Author's interpretation; not legal advice or a compliance determination." };
}

export interface ScaffoldPlanItem {
  ruleId: string;
  title: string;
  target: string;
  template: string;
  templateExists: boolean;
  status: 'present' | 'missing';
  presentAt?: string;
}

/** What `deploy` would write, without writing anything. */
export function planScaffold(root: string, m: Manifest, stack = 'typescript-express'): ScaffoldPlanItem[] {
  return loadRules()
    .rules.filter((r) => r.kind === 'scaffold' && (r.when ?? []).every((c) => holds(m, c)))
    .map((r) => {
      const ext = r.template!.slice(r.template!.lastIndexOf('.'));
      const template = `templates/${stack}/${r.template}`;
      const presentAt = scaffoldCandidates(r).find((c) => existsSync(join(root, c)));
      return {
        ruleId: r.id,
        title: r.title,
        target: `${r.dir}/${r.name}${ext}`,
        template,
        templateExists: existsSync(assetPath(template)),
        status: presentAt ? 'present' : 'missing',
        ...(presentAt ? { presentAt } : {}),
      };
    });
}
