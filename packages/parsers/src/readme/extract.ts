import type {
  HttpMethod,
  ReadmeReferenceArtifact,
  ReadmeReferenceKind,
} from '@drift/shared';

const HTTP_METHOD_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+`?(\/[A-Za-z0-9_./:{}-]*)`?/gi;
const INLINE_COMMAND_PATTERN =
  /`((?:npm|pnpm|yarn)\s+[A-Za-z0-9:._ -]+)`|((?:^|\s)(?:npm|pnpm|yarn)\s+[A-Za-z0-9:._ -]+)/gi;
const INLINE_ENV_PATTERN = /`([A-Z][A-Z0-9_]{2,})`|(?:^|\s)([A-Z][A-Z0-9_]{2,})=/g;
const STANDALONE_PATH_PATTERN = /`(\/[A-Za-z0-9_./:{}-]+)`|(?:^|\s)(\/[A-Za-z0-9_./:{}-]+)/g;
const ENDPOINT_HINT_PATTERN = /\b(api|endpoint|route|rota|curl|fetch|axios|request|response)\b/i;

type MarkdownFileInput = {
  filePath: string;
  content: string;
};

export function extractReadmeArtifactsFromMarkdownFile(
  input: MarkdownFileInput,
): ReadmeReferenceArtifact[] {
  const artifacts: ReadmeReferenceArtifact[] = [];
  const lines = input.content.split(/\r?\n/);
  let section: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);

    if (headingMatch) {
      section = headingMatch[1].trim();
    }

    artifacts.push(...extractEndpointArtifactsFromLine(input.filePath, line, index + 1, section));
    artifacts.push(...extractCommandArtifactsFromLine(input.filePath, line, index + 1, section));
    artifacts.push(...extractEnvArtifactsFromLine(input.filePath, line, index + 1, section));
  }

  return dedupeArtifacts(artifacts);
}

function extractEndpointArtifactsFromLine(
  filePath: string,
  line: string,
  lineNumber: number,
  section: string | null,
): ReadmeReferenceArtifact[] {
  const artifacts: ReadmeReferenceArtifact[] = [];
  const seenValues = new Set<string>();

  for (const match of line.matchAll(HTTP_METHOD_PATTERN)) {
    const method = match[1]?.toUpperCase() as Exclude<HttpMethod, 'ALL'> | undefined;
    const path = normalizePath(match[2]);

    if (!method || !path) {
      continue;
    }

    seenValues.add(`${method}:${path}`);
    artifacts.push(
      createReadmeArtifact({
        filePath,
        lineNumber,
        section,
        referenceKind: 'endpoint',
        value: `${method} ${path}`,
        method,
        normalizedPath: path,
      }),
    );
  }

  if (!ENDPOINT_HINT_PATTERN.test(line)) {
    return artifacts;
  }

  for (const match of line.matchAll(STANDALONE_PATH_PATTERN)) {
    const rawPath = match[1] ?? match[2];
    const path = normalizePath(rawPath);

    if (!path || seenValues.has(`:${path}`) || seenValues.has(`GET:${path}`)) {
      continue;
    }

    artifacts.push(
      createReadmeArtifact({
        filePath,
        lineNumber,
        section,
        referenceKind: 'endpoint',
        value: path,
        method: null,
        normalizedPath: path,
      }),
    );
  }

  return artifacts;
}

function extractCommandArtifactsFromLine(
  filePath: string,
  line: string,
  lineNumber: number,
  section: string | null,
): ReadmeReferenceArtifact[] {
  const artifacts: ReadmeReferenceArtifact[] = [];

  for (const match of line.matchAll(INLINE_COMMAND_PATTERN)) {
    const command = (match[1] ?? match[2] ?? '').trim();

    if (!command) {
      continue;
    }

    artifacts.push(
      createReadmeArtifact({
        filePath,
        lineNumber,
        section,
        referenceKind: 'command',
        value: command,
        method: null,
        normalizedPath: null,
      }),
    );
  }

  return artifacts;
}

function extractEnvArtifactsFromLine(
  filePath: string,
  line: string,
  lineNumber: number,
  section: string | null,
): ReadmeReferenceArtifact[] {
  const artifacts: ReadmeReferenceArtifact[] = [];

  for (const match of line.matchAll(INLINE_ENV_PATTERN)) {
    const envVar = (match[1] ?? match[2] ?? '').trim();

    if (!envVar) {
      continue;
    }

    artifacts.push(
      createReadmeArtifact({
        filePath,
        lineNumber,
        section,
        referenceKind: 'env',
        value: envVar,
        method: null,
        normalizedPath: null,
      }),
    );
  }

  return artifacts;
}

function createReadmeArtifact(params: {
  filePath: string;
  lineNumber: number;
  section: string | null;
  referenceKind: ReadmeReferenceKind;
  value: string;
  method: Exclude<HttpMethod, 'ALL'> | null;
  normalizedPath: string | null;
}): ReadmeReferenceArtifact {
  return {
    id: `readme_reference:${params.filePath}:${params.lineNumber}:${params.referenceKind}:${params.value}`,
    kind: 'readme_reference',
    source: 'readme',
    file: params.filePath,
    line: params.lineNumber,
    referenceKind: params.referenceKind,
    section: params.section,
    value: params.value,
    method: params.method,
    normalizedPath: params.normalizedPath,
  };
}

function dedupeArtifacts(artifacts: ReadmeReferenceArtifact[]): ReadmeReferenceArtifact[] {
  const seen = new Set<string>();

  return artifacts.filter((artifact) => {
    const key = `${artifact.file}:${artifact.line}:${artifact.referenceKind}:${artifact.value}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizePath(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/[`"' )]+$/g, '');

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? trimmed;

  if (!withoutQuery.startsWith('/')) {
    return null;
  }

  return withoutQuery.replace(/\/+$/g, '') || '/';
}
