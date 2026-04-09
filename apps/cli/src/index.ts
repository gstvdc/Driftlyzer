import path from 'node:path';

import { scanRepository, type RepositoryScanSummary } from '@drift/core';

type ScanOptions = {
  json: boolean;
  targetPath: string;
};

function printHelp(): void {
  console.log(`Drift Guardian CLI

Usage:
  drift-check scan <path> [--json]

Examples:
  drift-check scan .
  drift-check scan ./repo --json
`);
}

function parseScanOptions(args: string[]): ScanOptions {
  const json = args.includes('--json');
  const positional = args.filter((arg) => arg !== '--json');
  const targetPath = positional[0] ?? '.';
  const invocationCwd = process.env.INIT_CWD ?? process.cwd();

  return {
    json,
    targetPath: path.resolve(invocationCwd, targetPath),
  };
}

function printSummary(summary: RepositoryScanSummary): void {
  console.log('Drift Guardian bootstrap scan');
  console.log(`Root: ${summary.rootPath}`);
  console.log(`Scanned at: ${summary.scannedAt}`);
  console.log(`Total files: ${summary.totalFiles}`);
  console.log(`Total artifacts: ${summary.totalArtifacts}`);
  console.log(`Total relations: ${summary.totalRelations}`);
  console.log(`Total findings: ${summary.totalFindings}`);
  console.log('');
  console.log('Counts by kind:');

  for (const [kind, count] of Object.entries(summary.byKind)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log('');
  console.log('Artifact counts:');

  for (const [kind, count] of Object.entries(summary.artifactCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log('');
  console.log('Relation counts:');

  for (const [kind, count] of Object.entries(summary.relationCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log('');
  console.log('Finding counts:');

  for (const [kind, count] of Object.entries(summary.findingCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log('');
  console.log('Sample files:');

  for (const file of summary.files.slice(0, 12)) {
    console.log(`- [${file.kind}] ${file.path}`);
  }

  if (summary.files.length > 12) {
    console.log(`- ... ${summary.files.length - 12} additional files`);
  }

  if (summary.artifacts.length > 0) {
    console.log('');
    console.log('Sample artifacts:');

    for (const artifact of summary.artifacts.slice(0, 8)) {
      if (artifact.kind === 'nestjs_controller') {
        console.log(`- [controller] ${artifact.className} -> ${artifact.basePath || '/'}`);
        continue;
      }

      if (artifact.kind === 'nestjs_endpoint') {
        console.log(`- [endpoint] ${artifact.method} ${artifact.fullPath} -> ${artifact.handlerName}`);
        continue;
      }

      if (artifact.kind === 'angular_http_call') {
        console.log(
          `- [angular] ${artifact.method} ${artifact.normalizedPath ?? artifact.urlExpression} -> ${artifact.memberName}`,
        );
        continue;
      }

      if (artifact.kind === 'package_script') {
        console.log(`- [script] ${artifact.scriptName} -> ${artifact.command}`);
        continue;
      }

      if (artifact.kind === 'env_usage') {
        console.log(`- [env:usage] ${artifact.variableName} -> ${artifact.accessPattern}`);
        continue;
      }

      if (artifact.kind === 'env_definition') {
        console.log(`- [env:def] ${artifact.variableName}`);
        continue;
      }

      console.log(
        `- [readme:${artifact.referenceKind}] ${artifact.value}${artifact.section ? ` (${artifact.section})` : ''}`,
      );
    }

    if (summary.artifacts.length > 8) {
      console.log(`- ... ${summary.artifacts.length - 8} additional artifacts`);
    }
  }

  if (summary.relations.length > 0) {
    console.log('');
    console.log('Sample relations:');

    for (const relation of summary.relations.slice(0, 8)) {
      console.log(`- [${relation.kind}] ${relation.sourceArtifactId} -> ${relation.targetArtifactId}`);
    }

    if (summary.relations.length > 8) {
      console.log(`- ... ${summary.relations.length - 8} additional relations`);
    }
  }

  if (summary.findings.length > 0) {
    console.log('');
    console.log('Sample findings:');

    for (const finding of summary.findings.slice(0, 8)) {
      console.log(`- [${finding.severity}] ${finding.type}: ${finding.evidence}`);
    }

    if (summary.findings.length > 8) {
      console.log(`- ... ${summary.findings.length - 8} additional findings`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command !== 'scan') {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseScanOptions(args.slice(1));
  const summary = await scanRepository(options.targetPath);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`drift-check failed: ${message}`);
  process.exitCode = 1;
});
