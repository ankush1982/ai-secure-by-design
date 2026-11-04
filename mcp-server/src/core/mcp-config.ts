// Checks MCP client configuration (AIW-007, AIW-008, AIW-009): unpinned server packages,
// remote servers over plain HTTP, and tools approved automatically. Ported from the AI
// Security Wiki's aiwiki_check.py so both give the same answer.
import { ignored } from './scan.js';
import type { Finding, Rule } from './types.js';

const CONFIG_NAMES = new Set(['mcp.json', '.mcp.json', 'mcp_config.json', 'claude_desktop_config.json', 'settings.json', 'cline_mcp_settings.json']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const RUNNERS: Record<string, 'npm' | 'py'> = { npx: 'npm', pnpx: 'npm', bunx: 'npm', uvx: 'py', pipx: 'py' };
const DOCKER_VALUE_FLAGS = new Set(['-e', '--env', '-v', '--volume', '-p', '--publish', '--name', '--network', '-w', '--workdir', '--entrypoint', '--mount', '-u', '--user', '--env-file', '-l', '--label', '--platform']);

export function isMcpConfig(file: string, text: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1);
  return CONFIG_NAMES.has(name) || (name.endsWith('.json') && (text.includes('mcpServers') || text.includes('"servers"')));
}

/** Describes the unpinned package or image, or returns undefined if it is pinned. */
export function unpinned(command: string, args: unknown[]): string | undefined {
  const base = command.replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.cmd$/, '').replace(/\.exe$/, '');
  let rest = args.filter((a): a is string => typeof a === 'string');
  if ((base === 'docker' || base === 'podman') && rest.includes('run')) {
    let skip = false;
    for (const a of rest.slice(rest.indexOf('run') + 1)) {
      if (skip) skip = false;
      else if (DOCKER_VALUE_FLAGS.has(a)) skip = true;
      else if (!a.startsWith('-')) return a.includes('@sha256:') ? undefined : `image ${a} is not pinned by digest`;
    }
    return undefined;
  }
  const kind = RUNNERS[base];
  if (!kind) return undefined;
  if (base === 'pipx' && rest[0] === 'run') rest = rest.slice(1);
  const from = rest.indexOf('--from');
  const pkg = from >= 0 && from + 1 < rest.length ? rest[from + 1]! : (rest.find((a) => !a.startsWith('-')) ?? '');
  if (!pkg) return undefined;
  let version: string;
  if (kind === 'npm') {
    const name = pkg.startsWith('@') ? pkg.slice(1) : pkg;
    version = name.includes('@') ? name.slice(name.indexOf('@') + 1) : '';
  } else {
    version = /==|@/.test(pkg) ? pkg.split(/==|@/)[1]! : '';
  }
  return !version || version === 'latest' || version === 'next' || !/^v?\d/.test(version) ? `${base} ${pkg}` : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function scanMcpConfig(text: string, file: string, rules: Rule[]): Finding[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(data)) return [];
  const servers: Record<string, unknown> = {};
  for (const key of ['mcpServers', 'servers', 'mcp_servers']) if (isObject(data[key])) Object.assign(servers, data[key]);
  if (isObject(data.mcp) && isObject(data.mcp.servers)) Object.assign(servers, data.mcp.servers);

  const lines = text.split(/\r?\n/);
  const out: Finding[] = [];
  const add = (id: string, line: number, detail: string): void => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    out.push({
      ruleId: id,
      title: rule.title,
      severity: rule.severity,
      message: `${rule.message ?? rule.title} (${detail})`,
      remediation: rule.remediation,
      file,
      line,
      snippet: (lines[line - 1] ?? '').trim().slice(0, 200),
      regimes: rule.regimes ?? [],
    });
  };
  for (const [name, spec] of Object.entries(servers)) {
    if (!isObject(spec)) continue;
    const at = text.indexOf(JSON.stringify(name));
    const line = at >= 0 ? text.slice(0, at).split('\n').length : 1;
    if (ignored(lines[line - 1] ?? '', '')) continue;
    const what = unpinned(String(spec.command ?? ''), Array.isArray(spec.args) ? spec.args : []);
    if (what) add('AIW-007', line, `server ${name}: ${what}`);
    const url = String(spec.url ?? spec.serverUrl ?? spec.httpUrl ?? '');
    const host = /^http:\/\/(\[[^\]]+\]|[^/:]+)/i.exec(url)?.[1];
    if (host && !LOOPBACK.has(host.toLowerCase())) add('AIW-008', line, `server ${name}: ${url}`);
    const auto = ['autoApprove', 'alwaysAllow', 'trust'].filter((k) => {
      const v = spec[k];
      return v !== undefined && v !== null && v !== false && v !== '' && !(Array.isArray(v) && v.length === 0);
    });
    if (auto.length) add('AIW-009', line, `server ${name}: ${auto.join(', ')}`);
  }
  return out;
}
