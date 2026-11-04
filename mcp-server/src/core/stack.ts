// Stack and AI SDK detection from dependency files. Deterministic: the same files give
// the same answer, and two matching stacks give no answer, so the user decides.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StackDetection {
  /** Set only when exactly one stack matches. */
  stack?: string;
  candidates: string[];
  evidence: string[];
  aiSdks: string[];
  notes: string[];
}

const STACK_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Rejects a stack id that is not a plain name. It becomes a path under templates/. */
export function checkStack(id: string): string {
  if (!STACK_ID.test(id)) throw new Error(`invalid stack id ${id}`);
  return id;
}

const NODE_STACKS: Array<[string, string]> = [['express', 'typescript-express'], ['next', 'typescript-nextjs']];
const NODE_AI = ['openai', '@anthropic-ai/sdk', 'langchain', 'llamaindex', '@google/generative-ai', 'ai'];
const PY_AI = ['openai', 'anthropic', 'langchain', 'llama-index', 'google-generativeai'];
const PY_FILES = ['requirements.txt', 'pyproject.toml'];

function read(root: string, file: string): string | undefined {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return undefined;
  }
}

function nodeDeps(root: string): Set<string> {
  try {
    const pkg = JSON.parse(read(root, 'package.json') ?? '{}');
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
}

const pyDep = (text: string, dep: string) => new RegExp(`(^|["'\\s])${dep}\\b`, 'im').test(text);

export function detectStack(root: string): StackDetection {
  const deps = nodeDeps(root);
  const candidates: string[] = [];
  const evidence: string[] = [];
  const aiSdks = new Set<string>();
  const notes: string[] = [];

  for (const [dep, stack] of NODE_STACKS) {
    if (!deps.has(dep)) continue;
    candidates.push(stack);
    evidence.push(`${dep} in package.json`);
  }
  for (const sdk of NODE_AI) if (deps.has(sdk)) aiSdks.add(sdk);
  if (candidates.includes('typescript-express') && !deps.has('typescript') && read(root, 'tsconfig.json') === undefined) {
    notes.push('Express without TypeScript: the scaffolds are .ts files, so this project needs a TypeScript build step to use them.');
  }

  for (const file of PY_FILES) {
    const text = read(root, file);
    if (text === undefined) continue;
    if (pyDep(text, 'fastapi')) {
      if (!candidates.includes('python-fastapi')) candidates.push('python-fastapi');
      evidence.push(`fastapi in ${file}`);
    }
    for (const sdk of PY_AI) if (pyDep(text, sdk)) aiSdks.add(sdk);
  }

  return {
    ...(candidates.length === 1 ? { stack: candidates[0] } : {}),
    candidates,
    evidence,
    aiSdks: [...aiSdks].sort(),
    notes,
  };
}
