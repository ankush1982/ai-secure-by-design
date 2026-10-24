#!/usr/bin/env node
// MCP server for secure-by-design. A thin adapter over the engine in ./core, so any
// MCP client gets the same findings as the CLI, git hooks and CI.
//
//   sbd-mcp                       stdio transport (default; no network)
//   sbd-mcp --http [--port 8765]  Streamable HTTP on 127.0.0.1 (opt-in)
//
// Tools (all read-only): sbd_validate_manifest, sbd_check, sbd_scan_text, sbd_review_diff,
// sbd_list_controls, sbd_explain_control, sbd_plan_scaffold.
// Prompts: sbd-init, sbd-check, sbd-deploy. Resources: regime catalogues, schemas, manifest.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { timingSafeEqual } from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';
import { assetPath } from './core/assets.js';
import {
  confine,
  explainControl,
  listControls,
  loadManifest,
  loadRegimes,
  parseUnifiedDiff,
  planScaffold,
  result,
  runCheck,
  scanLines,
  scanText,
  toSarif,
  VERSION,
  DEFAULT_MANIFEST,
} from './core/index.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const error = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });

function guard<T>(fn: () => T) {
  try {
    return fn();
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e));
  }
}

function prompt(name: string): string {
  return readFileSync(assetPath('instructions', 'prompts', `${name}.md`), 'utf8');
}

export function buildServer(root: string): McpServer {
  const server = new McpServer({ name: 'secure-by-design', version: VERSION });
  const manifestArg = z.string().optional().describe(`Manifest path relative to the workspace root. Default ${DEFAULT_MANIFEST}.`);

  server.registerTool(
    'sbd_validate_manifest',
    {
      title: 'Validate manifest',
      description: 'Validate privacy-security-manifest.yaml against schemas/manifest.schema.json plus semantic checks. Returns findings.',
      inputSchema: { manifestPath: manifestArg },
      annotations: READ_ONLY,
    },
    async ({ manifestPath }) =>
      guard(() => {
        const rel = manifestPath ?? DEFAULT_MANIFEST;
        const { findings } = loadManifest(confine(root, rel), rel);
        return json(result(root, rel, undefined, findings));
      }),
  );

  server.registerTool(
    'sbd_check',
    {
      title: 'Check workspace',
      description:
        'Run every deterministic check (manifest, secrets, unclassified fields, scaffolds, audit-log and decision-log coverage, PII in logs) over the workspace. Same results as `sbd check`.',
      inputSchema: {
        manifestPath: manifestArg,
        diff: z.string().optional().describe('Only report on lines added in this git range, e.g. origin/main...HEAD.'),
        format: z.enum(['json', 'sarif']).optional().describe('json (default) or sarif 2.1.0.'),
      },
      annotations: READ_ONLY,
    },
    async ({ manifestPath, diff, format }) =>
      guard(() => {
        const r = runCheck({ root, manifestPath, diff });
        return json(format === 'sarif' ? toSarif(r) : r);
      }),
  );

  server.registerTool(
    'sbd_scan_text',
    {
      title: 'Scan text for secrets',
      description: 'Scan proposed file content for hardcoded secrets before writing it. Snippets in findings are masked.',
      inputSchema: {
        text: z.string().max(2_000_000),
        filename: z.string().optional().describe('Used for allow-listing lockfiles and fixtures, and in findings.'),
      },
      annotations: READ_ONLY,
    },
    async ({ text, filename }) => guard(() => json(result(root, '-', undefined, scanText(text, filename)))),
  );

  server.registerTool(
    'sbd_review_diff',
    {
      title: 'Review a diff',
      description:
        'Review a change. With `range`, runs the full check limited to lines that range adds. With `diffText` (a unified diff), scans the added lines for secrets only, because other checks need the surrounding file.',
      inputSchema: {
        range: z.string().optional().describe('git range in the workspace, e.g. origin/main...HEAD'),
        diffText: z.string().max(5_000_000).optional(),
        manifestPath: manifestArg,
      },
      annotations: READ_ONLY,
    },
    async ({ range, diffText, manifestPath }) =>
      guard(() => {
        if (range) return json(runCheck({ root, manifestPath, diff: range }));
        if (diffText) {
          const findings = [...parseUnifiedDiff(diffText)].flatMap(([file, lines]) => scanLines(lines, file));
          return json(result(root, '-', undefined, findings));
        }
        return error('pass range or diffText');
      }),
  );

  server.registerTool(
    'sbd_list_controls',
    {
      title: 'List controls',
      description: 'List the controls in each regime catalogue.',
      inputSchema: { regime: z.string().optional().describe('Regime id, or omit for all.') },
      annotations: READ_ONLY,
    },
    async ({ regime }) => guard(() => json(listControls(regime ?? 'all'))),
  );

  server.registerTool(
    'sbd_explain_control',
    {
      title: 'Explain a control',
      description: 'Explain one control: what it requires, how the plugin implements it, and which rules check it.',
      inputSchema: { regime: z.string(), control: z.string() },
      annotations: READ_ONLY,
    },
    async ({ regime, control }) =>
      guard(() => {
        const out = explainControl(regime, control);
        return out ? json(out) : error(`unknown control ${regime}/${control}`);
      }),
  );

  server.registerTool(
    'sbd_plan_scaffold',
    {
      title: 'Plan scaffolds',
      description: 'List the scaffolds the manifest requires, where each goes, its template, and whether it is already present. Writes nothing.',
      inputSchema: {
        manifestPath: manifestArg,
        stack: z.string().optional().describe('Template stack, default typescript-express.'),
      },
      annotations: READ_ONLY,
    },
    async ({ manifestPath, stack }) =>
      guard(() => {
        const rel = manifestPath ?? DEFAULT_MANIFEST;
        const { manifest, findings } = loadManifest(confine(root, rel), rel);
        return manifest ? json(planScaffold(root, manifest, stack)) : json(result(root, rel, undefined, findings));
      }),
  );

  for (const [name, description] of [
    ['sbd-init', 'Interview the user and write privacy-security-manifest.yaml.'],
    ['sbd-check', 'Run the checks and explain the findings.'],
    ['sbd-deploy', 'Plan and copy the scaffolds the manifest requires.'],
  ] as const) {
    server.registerPrompt(name, { title: name, description }, () => ({
      messages: [{ role: 'user', content: { type: 'text', text: prompt(name.slice(4)) } }],
    }));
  }

  server.registerResource(
    'regime',
    new ResourceTemplate('sbd://regimes/{id}', {
      list: () => ({
        resources: loadRegimes().map((r) => ({ uri: `sbd://regimes/${r.id}`, name: r.name, mimeType: 'application/yaml' })),
      }),
    }),
    { title: 'Regime catalogue', description: 'Controls for one regime (author\'s interpretation).', mimeType: 'application/yaml' },
    async (uri, { id }) => {
      if (!loadRegimes().some((r) => r.id === id)) throw new Error(`unknown regime ${String(id)}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/yaml', text: readFileSync(assetPath('regimes', `${String(id)}.yaml`), 'utf8') }] };
    },
  );

  for (const schema of ['manifest', 'regime', 'rules']) {
    server.registerResource(
      `${schema}-schema`,
      `sbd://schemas/${schema}`,
      { title: `${schema}.schema.json`, mimeType: 'application/schema+json' },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: readFileSync(assetPath('schemas', `${schema}.schema.json`), 'utf8') }] }),
    );
  }

  server.registerResource(
    'manifest',
    'sbd://manifest',
    { title: 'Workspace manifest', description: `${DEFAULT_MANIFEST} in the workspace root.`, mimeType: 'application/yaml' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/yaml', text: readFileSync(confine(root, DEFAULT_MANIFEST), 'utf8') }] }),
  );

  return server;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function serveHttp(root: string, host: string, port: number): Promise<void> {
  const token = process.env.SBD_HTTP_TOKEN;
  if (!LOOPBACK.has(host) && !token) {
    throw new Error(`refusing to listen on ${host} without SBD_HTTP_TOKEN; the server reads files in ${root}`);
  }
  const allowedHosts = process.env.SBD_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, ...(allowedHosts?.length ? { allowedHosts } : {}) });

  // Stateless mode: one server and transport per request, so nothing leaks between clients.
  app.post('/mcp', async (req: any, res: any) => {
    if (token && !tokenMatches(req.headers.authorization, token)) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null });
      return;
    }
    const server = buildServer(root);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const notAllowed = (_req: unknown, res: any) =>
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  await new Promise<void>((ok, fail) => {
    const s = app.listen(port, host, () => ok());
    s.on('error', fail);
  });
  process.stderr.write(`secure-by-design MCP server on http://${host}:${port}/mcp (root ${root})\n`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      http: { type: 'boolean', default: false },
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '8765' },
    },
  });
  const root = resolve(values.root ?? process.env.SBD_ROOT ?? process.cwd());
  if (values.http) {
    await serveHttp(root, values.host!, Number(values.port));
  } else {
    await buildServer(root).connect(new StdioServerTransport());
  }
}

main().catch((e) => {
  process.stderr.write(`sbd-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
