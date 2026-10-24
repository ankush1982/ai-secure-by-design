// Loads and schema-validates the data files the engine runs on.
import { readFileSync, readdirSync } from 'node:fs';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { parse as parseYaml } from 'yaml';
import { assetPath } from './assets.js';
import type { PersonalFieldsSpec, Regime, Rule } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

export function validator(schema: 'manifest' | 'regime' | 'rules'): ValidateFunction {
  let v = validators.get(schema);
  if (!v) {
    const json = JSON.parse(readFileSync(assetPath('schemas', `${schema}.schema.json`), 'utf8'));
    v = ajv.compile(json);
    validators.set(schema, v);
  }
  return v;
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}

function loadValidated<T>(file: string, schema: 'regime' | 'rules'): T {
  const data = parseYaml(readFileSync(file, 'utf8'));
  const v = validator(schema);
  if (!v(data)) {
    throw new Error(`${file} fails ${schema}.schema.json: ${formatErrors(v.errors).join('; ')}`);
  }
  return data as T;
}

let regimesCache: Regime[] | undefined;
export function loadRegimes(): Regime[] {
  if (!regimesCache) {
    const dir = assetPath('regimes');
    regimesCache = readdirSync(dir)
      .filter((f) => f.endsWith('.yaml'))
      .sort()
      .map((f) => loadValidated<Regime>(`${dir}/${f}`, 'regime'));
  }
  return regimesCache;
}

export interface RuleSet {
  rules: Rule[];
  personalFields: PersonalFieldsSpec;
}

let rulesCache: RuleSet | undefined;
export function loadRules(): RuleSet {
  if (rulesCache) return rulesCache;
  const dir = assetPath('rules');
  const rules: Rule[] = [];
  let personalFields: PersonalFieldsSpec | undefined;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
    const data = loadValidated<{ rules?: Rule[] } & Partial<PersonalFieldsSpec>>(`${dir}/${f}`, 'rules');
    if (data.rules) rules.push(...data.rules);
    else personalFields = data as PersonalFieldsSpec;
  }
  if (!personalFields) throw new Error('rules/personal-fields.yaml missing');
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
    ids.add(r.id);
  }
  rulesCache = { rules, personalFields };
  return rulesCache;
}
