// Path confinement. Every path an adapter passes in (CLI arg, MCP tool argument) is
// resolved against the workspace root and rejected if it escapes it.
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function confine(root: string, p: string): string {
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`path ${p} is outside the workspace root`);
  }
  return abs;
}

export const toPosix = (p: string): string => p.split(sep).join('/');
