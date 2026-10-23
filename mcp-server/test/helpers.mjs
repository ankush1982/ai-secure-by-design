import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI = join(REPO, 'mcp-server/dist/cli.js');
export const SERVER = join(REPO, 'mcp-server/dist/index.js');
export const FIXTURE = join(REPO, 'mcp-server/test/fixtures/clinic-app');

// Secrets are assembled at run time so this repository never contains a real-looking one.
export const FAKE = {
  aws: 'AKIA' + 'Z'.repeat(4) + '2345ABCDEFGH',
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
};

export function sbd(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function json(args, opts) {
  const r = sbd([...args, '--format', 'json', '--fail-on', 'none'], opts);
  if (r.code !== 0) throw new Error(`sbd ${args.join(' ')} exited ${r.code}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Copies the fixture to a temp dir, optionally as a git repo with one commit. */
export function tempFixture({ git = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sbd-'));
  cpSync(FIXTURE, dir, { recursive: true });
  if (git) {
    const run = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    run('init', '-q');
    run('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
    run('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--no-verify', '-m', 'base [human]');
  }
  return dir;
}
