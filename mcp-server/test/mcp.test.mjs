import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SERVER, json, tempFixture } from './helpers.mjs';

const TOOLS = ['sbd_check', 'sbd_explain_control', 'sbd_list_controls', 'sbd_plan_scaffold', 'sbd_review_diff', 'sbd_scan_text', 'sbd_validate_manifest'];

async function exercise(client, dir) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
  for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, `${t.name} read-only`);

  const res = await client.callTool({ name: 'sbd_check', arguments: {} });
  const viaMcp = JSON.parse(res.content[0].text).findings;
  assert.deepEqual(viaMcp, json(['check', '--root', dir]).findings, 'MCP and CLI give identical findings');

  const sarif = JSON.parse((await client.callTool({ name: 'sbd_check', arguments: { format: 'sarif' } })).content[0].text);
  assert.equal(sarif.version, '2.1.0');

  const bad = await client.callTool({ name: 'sbd_validate_manifest', arguments: { manifestPath: '../../../etc/passwd' } });
  assert.equal(bad.isError, true);

  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ['sbd-check', 'sbd-deploy', 'sbd-init']);
  const p = await client.getPrompt({ name: 'sbd-check' });
  assert.match(p.messages[0].content.text, /sbd_check/);

  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === 'sbd://regimes/dpdp-2023'));
  const regime = await client.readResource({ uri: 'sbd://regimes/dpdp-2023' });
  assert.match(regime.contents[0].text, /G\.S\.R\. 846\(E\)/);
}

test('MCP over stdio', async () => {
  const dir = tempFixture();
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, '--root', dir] }));
  try {
    await exercise(client, dir);
  } finally {
    await client.close();
  }
});

function startHttp(args, env = {}) {
  const proc = spawn(process.execPath, [SERVER, '--http', ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      if (err.includes('MCP server on')) resolve({ proc, err });
    });
    proc.on('exit', (code) => resolve({ proc, err, code }));
    setTimeout(() => reject(new Error(`timeout: ${err}`)), 10000);
  });
}

test('MCP over Streamable HTTP (localhost), with DNS-rebinding protection', async () => {
  const dir = tempFixture();
  const port = 20000 + Math.floor(Math.random() * 20000);
  const { proc } = await startHttp(['--root', dir, '--port', String(port)]);
  try {
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await exercise(client, dir);
    await client.close();

    // fetch() cannot override Host, so use node:http for the rebinding probe.
    const rebindStatus = await new Promise((ok, fail) => {
      const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' } }, (res) => {
        res.resume();
        ok(res.statusCode);
      });
      req.on('error', fail);
      req.end('{}');
    });
    assert.equal(rebindStatus, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status, 405);
  } finally {
    proc.kill();
  }
});

test('HTTP bearer token is enforced when set', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const { proc } = await startHttp(['--root', tempFixture(), '--port', String(port)], { SBD_HTTP_TOKEN: 'secret-token-value' });
  try {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } };
    const post = (auth) =>
      fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify(init),
      });
    assert.equal((await post()).status, 401);
    assert.equal((await post('Bearer wrong')).status, 401);
    assert.equal((await post('Bearer secret-token-value')).status, 200);
  } finally {
    proc.kill();
  }
});

test('HTTP refuses a non-loopback bind without a token', async () => {
  const { code, err } = await startHttp(['--host', '0.0.0.0', '--port', '0'], { SBD_HTTP_TOKEN: '' });
  assert.equal(code, 1);
  assert.match(err, /refusing to listen/);
});
