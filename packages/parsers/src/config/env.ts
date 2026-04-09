import type { EnvDefinitionArtifact, EnvUsageArtifact } from '@drift/shared';

type TextFileInput = {
  filePath: string;
  content: string;
};

const PROCESS_ENV_DOT_PATTERN = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const PROCESS_ENV_BRACKET_PATTERN = /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
const IMPORT_META_ENV_PATTERN = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
const ENV_DEFINITION_PATTERN = /^\s*([A-Z][A-Z0-9_]*)\s*=/gm;

export function extractEnvUsagesFromSourceFile(input: TextFileInput): EnvUsageArtifact[] {
  return dedupeEnvUsageArtifacts([
    ...collectUsageArtifacts(input, PROCESS_ENV_DOT_PATTERN, 'process.env'),
    ...collectUsageArtifacts(input, PROCESS_ENV_BRACKET_PATTERN, 'process.env'),
    ...collectUsageArtifacts(input, IMPORT_META_ENV_PATTERN, 'import.meta.env'),
  ]);
}

export function extractEnvDefinitionsFromEnvFile(input: TextFileInput): EnvDefinitionArtifact[] {
  const artifacts: EnvDefinitionArtifact[] = [];

  for (const match of input.content.matchAll(ENV_DEFINITION_PATTERN)) {
    const variableName = match[1];

    if (!variableName || typeof match.index !== 'number') {
      continue;
    }

    artifacts.push({
      id: `env_definition:${input.filePath}:${variableName}`,
      kind: 'env_definition',
      source: 'config',
      file: input.filePath,
      line: toLineNumber(input.content, match.index),
      variableName,
    });
  }

  return dedupeEnvDefinitionArtifacts(artifacts);
}

function collectUsageArtifacts(
  input: TextFileInput,
  pattern: RegExp,
  accessPattern: EnvUsageArtifact['accessPattern'],
): EnvUsageArtifact[] {
  const artifacts: EnvUsageArtifact[] = [];

  for (const match of input.content.matchAll(pattern)) {
    const variableName = match[1];

    if (!variableName || typeof match.index !== 'number') {
      continue;
    }

    artifacts.push({
      id: `env_usage:${input.filePath}:${accessPattern}:${variableName}:${match.index}`,
      kind: 'env_usage',
      source: 'generic',
      file: input.filePath,
      line: toLineNumber(input.content, match.index),
      variableName,
      accessPattern,
    });
  }

  return artifacts;
}

function dedupeEnvUsageArtifacts(artifacts: EnvUsageArtifact[]): EnvUsageArtifact[] {
  const seen = new Set<string>();

  return artifacts.filter((artifact) => {
    const key = `${artifact.file}:${artifact.variableName}:${artifact.line}:${artifact.accessPattern}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeEnvDefinitionArtifacts(artifacts: EnvDefinitionArtifact[]): EnvDefinitionArtifact[] {
  const seen = new Set<string>();

  return artifacts.filter((artifact) => {
    const key = `${artifact.file}:${artifact.variableName}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function toLineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}
