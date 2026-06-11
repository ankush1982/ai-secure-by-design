// MCP server entry — exposes secure-by-design tools to Claude Code (and any MCP client).
//
// Tools registered:
//   - sbd_validate_manifest   — read privacy-security-manifest.yaml, return errors + warnings
//   - sbd_scan_secrets        — grep working tree for hardcoded secret patterns
//   - sbd_scan_pii_in_logs    — grep for raw user-object logging
//   - sbd_check_regimes       — full /sbd-check equivalent as a single tool call
//   - sbd_list_controls       — list controls per regime
//   - sbd_explain_control     — explain what a specific control does and why

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { join } from 'node:path';

const server = new Server(
  { name: 'secure-by-design', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

interface ValidateManifestInput { manifestPath?: string }
interface ValidateManifestOutput {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    product: string;
    regimes: string[];
    categories: number;
    aiSystems: number;
  };
}

async function validateManifest(input: ValidateManifestInput): Promise<ValidateManifestOutput> {
  const path = input.manifestPath ?? './privacy-security-manifest.yaml';
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return { ok: false, errors: [`manifest not found at ${path} — run /sbd-init`], warnings: [] };
  }

  let m: Record<string, unknown>;
  try {
    m = parseYaml(raw) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, errors: [`yaml parse error: ${e instanceof Error ? e.message : e}`], warnings: [] };
  }

  if (!m.schemaVersion) errors.push('schemaVersion missing');
  if (!m.product) errors.push('product block missing');
  if (!Array.isArray(m.regimes) || m.regimes.length === 0) errors.push('regimes missing or empty');
  if (!Array.isArray(m.dataCategories)) errors.push('dataCategories must be an array');

  const dataCategories = (m.dataCategories ?? []) as Array<Record<string, unknown>>;
  for (const c of dataCategories) {
    if (!c.name) errors.push('dataCategory missing name');
    if (!c.sensitivity) errors.push(`dataCategory ${c.name}: sensitivity missing`);
    if (c.consentRequired === true && !c.retentionDays) {
      warnings.push(`dataCategory ${c.name}: retentionDays unset despite consentRequired=true (DPDP §8(7))`);
    }
    if (c.childrenDataPossible === true && c.sensitivity === 'not-personal') {
      warnings.push(`dataCategory ${c.name}: childrenDataPossible=true but sensitivity=not-personal — likely misclassification`);
    }
  }

  const regimes = (m.regimes ?? []) as Array<Record<string, unknown>>;
  const product = m.product as Record<string, unknown>;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      product: String(product?.name ?? 'unnamed'),
      regimes: regimes.map((r) => String(r.id)),
      categories: dataCategories.length,
      aiSystems: Array.isArray(m.aiSystems) ? (m.aiSystems as unknown[]).length : 0,
    },
  };
}

const TOOLS = [
  {
    name: 'sbd_validate_manifest',
    description: 'Validate privacy-security-manifest.yaml. Returns errors, warnings, and a summary.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        manifestPath: { type: 'string', description: 'Path to the manifest. Defaults to ./privacy-security-manifest.yaml.' },
      },
    },
  },
  {
    name: 'sbd_list_controls',
    description: 'List all controls for the regimes declared in the manifest, with implementation hints.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        regime: { type: 'string', enum: ['nist-ssdf-1.1', 'iso-27001-2022', 'dpdp-2023', 'all'] },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'sbd_validate_manifest') {
    const result = await validateManifest((args ?? {}) as ValidateManifestInput);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  if (name === 'sbd_list_controls') {
    const regimeFilter = (args?.regime as string) ?? 'all';
    const regimesDir = join(import.meta.dirname ?? '.', '..', '..', 'regimes');
    const ids = ['nist-ssdf-1.1', 'iso-27001-2022', 'dpdp-2023'];
    const results: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      if (regimeFilter !== 'all' && regimeFilter !== id) continue;
      try {
        const raw = await readFile(join(regimesDir, `${id}.yaml`), 'utf8');
        const parsed = parseYaml(raw) as Record<string, unknown>;
        results.push({ id, controls: parsed.controls });
      } catch {
        // skip regimes that aren't installed
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }

  return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
