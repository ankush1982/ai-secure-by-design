// Extracts data-model field names from schema sources: Prisma, SQL DDL, Drizzle,
// SQLAlchemy / Django / Pydantic models and TypeScript interfaces in model files.
// Deterministic and regex-based; it reports candidates, the user classifies them.

export interface FieldHit {
  name: string;
  line: number;
}

const SCHEMA_FILE = /(\.prisma|\.sql|(^|\/)(models?|schemas?|entities|db)(\/|\.)[^/]*\.(ts|js|py)|(^|\/)[^/]*(model|schema|entity)s?\.(ts|js|py))$/i;

export function isSchemaFile(path: string): boolean {
  return SCHEMA_FILE.test(path);
}

const KEYWORDS = new Set(['model', 'enum', 'create', 'table', 'primary', 'foreign', 'constraint', 'unique', 'index', 'key', 'check', 'class', 'def', 'return', 'import', 'from', 'export', 'interface', 'type', 'const', 'let', 'var', 'meta', 'config', 'id']);

export function extractFields(path: string, text: string): FieldHit[] {
  const lines = text.split(/\r?\n/);
  const hits: FieldHit[] = [];
  const add = (name: string | undefined, i: number) => {
    if (name && !KEYWORDS.has(name.toLowerCase())) hits.push({ name, line: i + 1 });
  };
  if (path.endsWith('.prisma')) {
    let inModel = false;
    lines.forEach((l, i) => {
      if (/^\s*model\s+\w+\s*\{/.test(l)) inModel = true;
      else if (/^\s*\}/.test(l)) inModel = false;
      else if (inModel) add(/^\s*([A-Za-z_]\w*)\s+[A-Z]\w*/.exec(l)?.[1], i);
    });
    return hits;
  }
  if (path.endsWith('.sql')) {
    let inTable = false;
    lines.forEach((l, i) => {
      if (/create\s+table/i.test(l)) inTable = true;
      else if (inTable && /^\s*\)\s*;?/.test(l)) inTable = false;
      else if (inTable) add(/^\s*["`]?([A-Za-z_]\w*)["`]?\s+[A-Za-z]/.exec(l)?.[1], i);
      const alter = /alter\s+table\s+\S+\s+add\s+(?:column\s+)?["`]?([A-Za-z_]\w*)/i.exec(l);
      if (alter) add(alter[1], i);
    });
    return hits;
  }
  if (path.endsWith('.py')) {
    lines.forEach((l, i) => {
      // SQLAlchemy Column / mapped_column, Django fields, Pydantic / dataclass annotations
      const m = /^\s{4}([a-z_][a-z0-9_]*)\s*(?::\s*[A-Za-z_][\w[\], .|]*)?\s*=\s*(?:\w+\.)?(Column|mapped_column|\w+Field)\(/.exec(l)
        ?? /^\s{4}([a-z_][a-z0-9_]*)\s*:\s*(?:Mapped\[|Optional\[|str|int|float|bool|date|datetime|EmailStr|list|dict)/.exec(l);
      add(m?.[1], i);
    });
    return hits;
  }
  // TS / JS: Drizzle columns (`email: varchar(...)`) and interface/type members.
  lines.forEach((l, i) => {
    const m = /^\s+([a-zA-Z_]\w*)\??\s*:\s*(?:[a-z]\w*\(|string|number|boolean|Date|bigint)/.exec(l);
    add(m?.[1], i);
  });
  return hits;
}

/** Splits a field name into lower-case words: dateOfBirth / date_of_birth -> [date, of, birth]. */
export function fieldWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean);
}
