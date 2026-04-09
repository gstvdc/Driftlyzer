import type { PackageScriptArtifact } from '@drift/shared';

type JsonFileInput = {
  filePath: string;
  content: string;
};

export function extractPackageScriptsFromPackageJsonFile(
  input: JsonFileInput,
): PackageScriptArtifact[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.content);
  } catch {
    return [];
  }

  if (!isPackageJsonShape(parsed) || !parsed.scripts) {
    return [];
  }

  const artifacts: PackageScriptArtifact[] = [];

  for (const [scriptName, command] of Object.entries(parsed.scripts)) {
    if (typeof command !== 'string') {
      continue;
    }

    artifacts.push({
      id: `package_script:${input.filePath}:${scriptName}`,
      kind: 'package_script',
      source: 'config',
      file: input.filePath,
      line: findLineNumber(input.content, `"${scriptName}"`),
      packageName: typeof parsed.name === 'string' ? parsed.name : null,
      scriptName,
      command,
    });
  }

  return artifacts;
}

function isPackageJsonShape(value: unknown): value is {
  name?: unknown;
  scripts?: Record<string, unknown>;
} {
  return typeof value === 'object' && value !== null;
}

function findLineNumber(content: string, token: string): number {
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.includes(token)) {
      return index + 1;
    }
  }

  return 1;
}
