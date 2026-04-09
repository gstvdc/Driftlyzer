import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  RepositoryFileKind,
  RepositoryFileNode,
  RepositoryScanSummary,
} from '@drift/shared';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const EMPTY_KIND_COUNTS: Record<RepositoryFileKind, number> = {
  source: 0,
  docs: 0,
  tests: 0,
  config: 0,
  spec: 0,
  other: 0,
};

const DOC_FILE_PATTERN = /\.(md|mdx|rst|txt)$/i;
const TEST_FILE_PATTERN = /(^|\/)(__tests__|tests?)\/|(\.|-)(test|spec)\.(ts|tsx|js|jsx)$/i;
const SPEC_FILE_PATTERN = /(openapi|swagger).*\.(json|ya?ml)$/i;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/i;
const CONFIG_FILE_PATTERN =
  /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|nest-cli\.json|angular\.json|eslint.*|prettier.*|docker-compose.*|\.gitignore|\.env(\..+)?|\.github\/workflows\/.+\.(yml|yaml))$/i;

export type { RepositoryFileKind, RepositoryFileNode, RepositoryScanSummary } from '@drift/shared';

export function classifyRepositoryFile(relativePath: string): RepositoryFileKind {
  const normalized = relativePath.split(path.sep).join('/');
  const lowerPath = normalized.toLowerCase();

  if (SPEC_FILE_PATTERN.test(lowerPath)) {
    return 'spec';
  }

  if (TEST_FILE_PATTERN.test(lowerPath)) {
    return 'tests';
  }

  if (CONFIG_FILE_PATTERN.test(lowerPath)) {
    return 'config';
  }

  if (DOC_FILE_PATTERN.test(lowerPath)) {
    return 'docs';
  }

  if (SOURCE_FILE_PATTERN.test(lowerPath)) {
    return 'source';
  }

  return 'other';
}

export async function scanRepository(rootPath: string): Promise<RepositoryScanSummary> {
  const absoluteRoot = path.resolve(rootPath);
  const files = (await walkDirectory(absoluteRoot, absoluteRoot)).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const byKind = { ...EMPTY_KIND_COUNTS };

  for (const file of files) {
    byKind[file.kind] += 1;
  }

  return {
    rootPath: absoluteRoot,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    byKind,
    files,
  };
}

async function walkDirectory(currentPath: string, rootPath: string): Promise<RepositoryFileNode[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: RepositoryFileNode[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkDirectory(path.join(currentPath, entry.name), rootPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
    const extension = path.extname(entry.name) || null;

    files.push({
      path: relativePath,
      extension,
      kind: classifyRepositoryFile(relativePath),
    });
  }

  return files;
}
