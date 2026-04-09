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
  console.log('');
  console.log('Counts by kind:');

  for (const [kind, count] of Object.entries(summary.byKind)) {
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
