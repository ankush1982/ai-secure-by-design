// Locates the bundled data directories (regimes/, rules/, schemas/, templates/).
// Works from a git checkout, an npm install and a Claude plugin install, because the
// compiled code always sits at <package>/mcp-server/dist/core/.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

export function packageRoot(): string {
  if (cached) return cached;
  if (process.env.SBD_PACKAGE_ROOT) {
    cached = resolve(process.env.SBD_PACKAGE_ROOT);
    return cached;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'rules')) && existsSync(join(dir, 'regimes'))) {
      cached = dir;
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error('sbd: cannot locate rules/ and regimes/ — set SBD_PACKAGE_ROOT');
}

export const assetPath = (...parts: string[]): string => join(packageRoot(), ...parts);
