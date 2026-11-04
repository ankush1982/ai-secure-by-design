// Path confinement. Every path an adapter passes in (CLI arg, MCP tool argument) is
// resolved against the workspace root and rejected if it escapes it.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const escapes = (rel: string) => rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);

export function confine(root: string, p: string): string {
  const abs = resolve(root, p);
  if (escapes(relative(root, abs))) {
    throw new Error(`path ${p} is outside the workspace root`);
  }
  return abs;
}

/** Whether a path to be written stays in the root once symlinks in its directory are followed. */
export function resolvesInside(root: string, p: string): boolean {
  let dir = dirname(confine(root, p));
  while (!existsSync(dir)) dir = dirname(dir);
  return !escapes(relative(realpathSync(root), realpathSync(dir)));
}

export const toPosix = (p: string): string => p.split(sep).join('/');
