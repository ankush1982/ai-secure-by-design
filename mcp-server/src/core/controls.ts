// Regime catalogue queries and scaffold planning (read-only).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applicable, DEFAULT_STACK, scaffoldCandidates, scaffoldFiles } from './check.js';
import { assetPath } from './assets.js';
import { loadRegimes, loadRules } from './load.js';
import { checkStack, detectStack } from './stack.js';
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

/** The stack to use: explicit, then declared in the manifest, then detected. */
export function resolveStack(root: string, m: Manifest, stack?: string): string | undefined {
  const s = stack ?? m.product.stack ?? detectStack(root).stack;
  return s === undefined ? s : checkStack(s);
}

/** Which scaffolds the manifest requires and where they stand. Writes nothing. */
export function planScaffold(root: string, m: Manifest, stackArg?: string): ScaffoldPlanItem[] {
  const { rules, stacks } = loadRules();
  const stack = resolveStack(root, m, stackArg) ?? DEFAULT_STACK;
  if (!Object.hasOwn(stacks, stack)) throw new Error(`unknown stack ${stack} (known: ${Object.keys(stacks).join(', ')})`);
  return rules
    .filter((r) => r.kind === 'scaffold' && applicable(r, m))
    .map((r) => {
      const { template, target } = scaffoldFiles(r, stack)!;
      const presentAt = scaffoldCandidates(r).find((c) => existsSync(join(root, c)));
      return {
        ruleId: r.id,
        title: r.title,
        target,
        template,
        templateExists: existsSync(assetPath(template)),
        status: presentAt ? 'present' : 'missing',
        ...(presentAt ? { presentAt } : {}),
      };
    });
}
