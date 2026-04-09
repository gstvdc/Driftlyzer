import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  extractAngularHttpArtifactsFromTypeScriptFile,
  extractEnvDefinitionsFromEnvFile,
  extractEnvUsagesFromSourceFile,
  extractNestArtifactsFromTypeScriptFile,
  extractPackageScriptsFromPackageJsonFile,
  extractReadmeArtifactsFromMarkdownFile,
} from '@drift/parsers';
import type {
  AngularHttpCallArtifact,
  DriftType,
  EnvDefinitionArtifact,
  EnvUsageArtifact,
  Finding,
  NestEndpointArtifact,
  PackageScriptArtifact,
  ReadmeReferenceArtifact,
  RepositoryArtifact,
  RepositoryArtifactKind,
  RepositoryFileKind,
  RepositoryFileNode,
  RepositoryRelation,
  RepositoryRelationKind,
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

const EMPTY_ARTIFACT_COUNTS: Record<RepositoryArtifactKind, number> = {
  nestjs_controller: 0,
  nestjs_endpoint: 0,
  angular_http_call: 0,
  readme_reference: 0,
  package_script: 0,
  env_usage: 0,
  env_definition: 0,
};

const EMPTY_RELATION_COUNTS: Record<RepositoryRelationKind, number> = {
  angular_consumes_nest_endpoint: 0,
  readme_mentions_nest_endpoint: 0,
  readme_mentions_package_script: 0,
  readme_mentions_env_var: 0,
};

const EMPTY_FINDING_COUNTS: Record<DriftType, number> = {
  comment_drift: 0,
  documentation_drift: 0,
  api_contract_drift: 0,
  config_drift: 0,
  test_drift: 0,
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
  const artifacts = await extractRepositoryArtifacts(absoluteRoot, files);
  const artifactCounts = { ...EMPTY_ARTIFACT_COUNTS };
  const relations = buildRepositoryRelations(artifacts);
  const relationCounts = { ...EMPTY_RELATION_COUNTS };
  const findings = buildFindings(artifacts, relations);
  const findingCounts = { ...EMPTY_FINDING_COUNTS };

  for (const file of files) {
    byKind[file.kind] += 1;
  }

  for (const artifact of artifacts) {
    artifactCounts[artifact.kind] += 1;
  }

  for (const relation of relations) {
    relationCounts[relation.kind] += 1;
  }

  for (const finding of findings) {
    findingCounts[finding.type] += 1;
  }

  return {
    rootPath: absoluteRoot,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    byKind,
    files,
    totalArtifacts: artifacts.length,
    artifactCounts,
    artifacts,
    totalRelations: relations.length,
    relationCounts,
    relations,
    totalFindings: findings.length,
    findingCounts,
    findings,
  };
}

async function extractRepositoryArtifacts(
  rootPath: string,
  files: RepositoryFileNode[],
): Promise<RepositoryArtifact[]> {
  const analyzableFiles = files.filter(
    (file) =>
      (file.kind === 'source' && file.extension === '.ts') ||
      (file.kind === 'docs' && file.extension === '.md') ||
      (file.kind === 'config' && (file.path.endsWith('package.json') || isEnvFilePath(file.path))),
  );
  const artifactGroups = await Promise.all(
    analyzableFiles.map(async (file) => {
      const absolutePath = path.join(rootPath, file.path);
      const content = await readFile(absolutePath, 'utf8');

      if (file.kind === 'docs') {
        return extractReadmeArtifactsFromMarkdownFile({
          filePath: file.path,
          content,
        });
      }

      if (file.kind === 'config' && file.path.endsWith('package.json')) {
        return extractPackageScriptsFromPackageJsonFile({
          filePath: file.path,
          content,
        });
      }

      if (file.kind === 'config' && isEnvFilePath(file.path)) {
        return extractEnvDefinitionsFromEnvFile({
          filePath: file.path,
          content,
        });
      }

      return extractNestArtifactsFromTypeScriptFile({
        filePath: file.path,
        content,
      }).concat(
        extractAngularHttpArtifactsFromTypeScriptFile({
          filePath: file.path,
          content,
        }),
        extractEnvUsagesFromSourceFile({
          filePath: file.path,
          content,
        }),
      );
    }),
  );

  return artifactGroups
    .flat()
    .sort(
      (left: RepositoryArtifact, right: RepositoryArtifact) =>
        left.file.localeCompare(right.file) || left.line - right.line,
    );
}

function buildRepositoryRelations(artifacts: RepositoryArtifact[]): RepositoryRelation[] {
  const nestEndpoints = artifacts.filter(
    (artifact): artifact is NestEndpointArtifact => artifact.kind === 'nestjs_endpoint',
  );
  const angularCalls = artifacts.filter(
    (artifact): artifact is AngularHttpCallArtifact => artifact.kind === 'angular_http_call',
  );
  const readmeReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'endpoint',
  );
  const readmeCommandReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'command',
  );
  const readmeEnvReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'env',
  );
  const packageScripts = artifacts.filter(
    (artifact): artifact is PackageScriptArtifact => artifact.kind === 'package_script',
  );
  const envDefinitions = artifacts.filter(
    (artifact): artifact is EnvDefinitionArtifact => artifact.kind === 'env_definition',
  );
  const envUsages = artifacts.filter(
    (artifact): artifact is EnvUsageArtifact => artifact.kind === 'env_usage',
  );
  const relations: RepositoryRelation[] = [];

  for (const angularCall of angularCalls) {
    const match = findBestNestEndpointMatch(angularCall, nestEndpoints);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:angular:${angularCall.id}->${match.id}`,
      kind: 'angular_consumes_nest_endpoint',
      sourceArtifactId: angularCall.id,
      targetArtifactId: match.id,
      confidence: 0.9,
      rationale: 'HTTP method matches and the normalized Angular path resolves to the same NestJS endpoint path.',
    });
  }

  for (const readmeReference of readmeReferences) {
    const match = findBestNestEndpointMatch(readmeReference, nestEndpoints);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme:${readmeReference.id}->${match.id}`,
      kind: 'readme_mentions_nest_endpoint',
      sourceArtifactId: readmeReference.id,
      targetArtifactId: match.id,
      confidence: readmeReference.method ? 0.88 : 0.72,
      rationale: readmeReference.method
        ? 'README reference matches the endpoint method and normalized path.'
        : 'README reference matches the endpoint path.',
    });
  }

  for (const readmeCommandReference of readmeCommandReferences) {
    const match = findMatchingPackageScript(readmeCommandReference, packageScripts);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme-command:${readmeCommandReference.id}->${match.id}`,
      kind: 'readme_mentions_package_script',
      sourceArtifactId: readmeCommandReference.id,
      targetArtifactId: match.id,
      confidence: 0.95,
      rationale: 'README command maps directly to a package.json script.',
    });
  }

  for (const readmeEnvReference of readmeEnvReferences) {
    const match = findMatchingEnvArtifact(readmeEnvReference, envDefinitions, envUsages);

    if (!match) {
      continue;
    }

    relations.push({
      id: `relation:readme-env:${readmeEnvReference.id}->${match.id}`,
      kind: 'readme_mentions_env_var',
      sourceArtifactId: readmeEnvReference.id,
      targetArtifactId: match.id,
      confidence: match.kind === 'env_definition' ? 0.92 : 0.84,
      rationale:
        match.kind === 'env_definition'
          ? 'README environment variable is defined in an env file.'
          : 'README environment variable is referenced by the codebase.',
    });
  }

  return relations;
}

function buildFindings(
  artifacts: RepositoryArtifact[],
  relations: RepositoryRelation[],
): Finding[] {
  const findings: Finding[] = [];
  const relatedSourceIds = new Set(relations.map((relation) => relation.sourceArtifactId));
  const nestEndpoints = artifacts.filter(
    (artifact): artifact is NestEndpointArtifact => artifact.kind === 'nestjs_endpoint',
  );
  const angularCalls = artifacts.filter(
    (artifact): artifact is AngularHttpCallArtifact => artifact.kind === 'angular_http_call',
  );
  const readmeEndpointReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'endpoint',
  );
  const readmeCommandReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'command',
  );
  const readmeEnvReferences = artifacts.filter(
    (artifact): artifact is ReadmeReferenceArtifact =>
      artifact.kind === 'readme_reference' && artifact.referenceKind === 'env',
  );

  for (const angularCall of angularCalls) {
    if (relatedSourceIds.has(angularCall.id)) {
      continue;
    }

    findings.push({
      type: 'api_contract_drift',
      severity: 'high',
      confidence: 0.94,
      file: angularCall.file,
      evidence: `Angular call ${angularCall.method} ${angularCall.normalizedPath ?? angularCall.urlExpression} has no matching NestJS endpoint.`,
      suggestedFix:
        'Atualizar a rota/metodo no frontend ou revisar a implementacao do endpoint no backend.',
    });
  }

  for (const readmeReference of readmeEndpointReferences) {
    if (relatedSourceIds.has(readmeReference.id)) {
      continue;
    }

    const closestEndpoint = findClosestEndpointByPath(readmeReference, nestEndpoints);

    findings.push({
      type: 'documentation_drift',
      severity: 'high',
      confidence: readmeReference.method ? 0.9 : 0.78,
      file: readmeReference.file,
      relatedFile: closestEndpoint?.file,
      evidence: `README reference ${readmeReference.value} has no matching NestJS endpoint.`,
      suggestedFix: 'Atualizar a documentacao ou alinhar a implementacao do endpoint correspondente.',
    });
  }

  for (const readmeCommandReference of readmeCommandReferences) {
    if (relatedSourceIds.has(readmeCommandReference.id)) {
      continue;
    }

    findings.push({
      type: 'documentation_drift',
      severity: 'medium',
      confidence: 0.91,
      file: readmeCommandReference.file,
      evidence: `README command ${readmeCommandReference.value} has no matching package.json script.`,
      suggestedFix: 'Atualizar o comando documentado ou alinhar os scripts do projeto.',
    });
  }

  for (const readmeEnvReference of readmeEnvReferences) {
    if (relatedSourceIds.has(readmeEnvReference.id)) {
      continue;
    }

    findings.push({
      type: 'config_drift',
      severity: 'medium',
      confidence: 0.87,
      file: readmeEnvReference.file,
      evidence: `README variable ${readmeEnvReference.value} is not defined in env files and was not found in code usage.`,
      suggestedFix: 'Atualizar a documentacao, adicionar a variavel em .env.example ou revisar o uso real no codigo.',
    });
  }

  return findings.sort((left, right) => left.file.localeCompare(right.file));
}

function findBestNestEndpointMatch(
  artifact: Pick<AngularHttpCallArtifact | ReadmeReferenceArtifact, 'method' | 'normalizedPath'>,
  endpoints: NestEndpointArtifact[],
): NestEndpointArtifact | null {
  if (!artifact.normalizedPath) {
    return null;
  }

  const artifactCandidates = createComparablePaths(artifact.normalizedPath);

  for (const endpoint of endpoints) {
    if (!artifactCandidates.has(normalizeComparablePath(endpoint.fullPath))) {
      continue;
    }

    if (artifact.method && artifact.method !== endpoint.method) {
      continue;
    }

    return endpoint;
  }

  return null;
}

function findClosestEndpointByPath(
  artifact: Pick<ReadmeReferenceArtifact, 'normalizedPath'>,
  endpoints: NestEndpointArtifact[],
): NestEndpointArtifact | null {
  if (!artifact.normalizedPath) {
    return null;
  }

  const artifactPath = normalizeComparablePath(artifact.normalizedPath);

  for (const endpoint of endpoints) {
    const endpointPath = normalizeComparablePath(endpoint.fullPath);

    if (endpointPath.endsWith(artifactPath) || artifactPath.endsWith(endpointPath)) {
      return endpoint;
    }
  }

  return null;
}

function findMatchingPackageScript(
  artifact: ReadmeReferenceArtifact,
  scripts: PackageScriptArtifact[],
): PackageScriptArtifact | null {
  const scriptName = extractScriptNameFromCommand(artifact.value);

  if (!scriptName) {
    return null;
  }

  return scripts.find((script) => script.scriptName === scriptName) ?? null;
}

function findMatchingEnvArtifact(
  artifact: ReadmeReferenceArtifact,
  definitions: EnvDefinitionArtifact[],
  usages: EnvUsageArtifact[],
): EnvDefinitionArtifact | EnvUsageArtifact | null {
  return (
    definitions.find((definition) => definition.variableName === artifact.value) ??
    usages.find((usage) => usage.variableName === artifact.value) ??
    null
  );
}

function extractScriptNameFromCommand(command: string): string | null {
  const normalized = command.trim();
  const npmRunMatch = normalized.match(/^(?:npm|pnpm)\s+run\s+([A-Za-z0-9:_-]+)/);

  if (npmRunMatch?.[1]) {
    return npmRunMatch[1];
  }

  const pnpmMatch = normalized.match(/^pnpm\s+([A-Za-z0-9:_-]+)/);

  if (pnpmMatch?.[1] && pnpmMatch[1] !== 'install') {
    return pnpmMatch[1];
  }

  const yarnMatch = normalized.match(/^yarn\s+([A-Za-z0-9:_-]+)/);

  if (yarnMatch?.[1] && yarnMatch[1] !== 'install' && yarnMatch[1] !== 'add') {
    return yarnMatch[1];
  }

  return null;
}

function createComparablePaths(pathValue: string): Set<string> {
  const normalized = normalizeComparablePath(pathValue);
  const values = new Set<string>([normalized]);

  if (normalized === '/api') {
    values.add('/');
  }

  if (normalized.startsWith('/api/')) {
    values.add(normalized.slice(4) || '/');
  }

  return values;
}

function normalizeComparablePath(pathValue: string): string {
  const cleaned = pathValue.trim().replace(/\/+$/g, '');

  return cleaned.length > 0 ? cleaned : '/';
}

function isEnvFilePath(filePath: string): boolean {
  return /(^|\/)\.env(\..+)?$/i.test(filePath);
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
