import path from "node:path";

import { scanRepository, type RepositoryScanSummary } from "@drift/core";

type ScanOptions = {
  json: boolean;
  targetPath: string;
  publishThreshold?: number;
  semanticReviewEnabled: boolean;
  ollamaModel: string;
  ollamaBaseUrl?: string;
  changedFiles: string[];
  impactDepth?: number;
};

function printHelp(): void {
  console.log(`Driftlyzer CLI

Usage:
  driftlyzer scan <path> [--json] [--publish-threshold <0..1>] [--semantic-review]
  driftlyzer scan <path> [--semantic-review] [--ollama-model llama3] [--ollama-base-url http://127.0.0.1:11434]
  driftlyzer scan <path> --changed-files <fileA,fileB> [--impact-depth 2]

Examples:
  driftlyzer scan .
  driftlyzer scan ./repo --json
  driftlyzer scan ./repo --publish-threshold 0.78
  driftlyzer scan ./repo --semantic-review --ollama-model llama3
  driftlyzer scan ./repo --changed-files frontend/src/app/users.service.ts,backend/src/users/users.controller.ts
`);
}

function parseScanOptions(args: string[]): ScanOptions {
  let json = false;
  let semanticReviewEnabled = false;
  let ollamaModel = "llama3";
  let ollamaBaseUrl: string | undefined;
  let publishThreshold: number | undefined;
  let impactDepth: number | undefined;
  let changedFiles: string[] = [];
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--semantic-review") {
      semanticReviewEnabled = true;
      continue;
    }

    if (arg === "--ollama-model") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --ollama-model");
      }

      ollamaModel = value;
      index += 1;
      continue;
    }

    if (arg === "--ollama-base-url") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --ollama-base-url");
      }

      ollamaBaseUrl = value;
      index += 1;
      continue;
    }

    if (arg === "--publish-threshold") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --publish-threshold");
      }

      const parsed = Number(value);

      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error("--publish-threshold must be between 0 and 1");
      }

      publishThreshold = parsed;
      index += 1;
      continue;
    }

    if (arg === "--changed-files") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --changed-files");
      }

      changedFiles = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      index += 1;
      continue;
    }

    if (arg === "--impact-depth") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --impact-depth");
      }

      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4) {
        throw new Error("--impact-depth must be an integer between 0 and 4");
      }

      impactDepth = parsed;
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  const targetPath = positional[0] ?? ".";
  const invocationCwd = process.env.INIT_CWD ?? process.cwd();

  return {
    json,
    targetPath: path.resolve(invocationCwd, targetPath),
    publishThreshold,
    semanticReviewEnabled,
    ollamaModel,
    ollamaBaseUrl,
    changedFiles,
    impactDepth,
  };
}

function printSummary(summary: RepositoryScanSummary): void {
  console.log("Driftlyzer scan summary");
  console.log(`Root: ${summary.rootPath}`);
  console.log(`Scanned at: ${summary.scannedAt}`);
  console.log(`Finding schema: ${summary.findingSchemaVersion}`);
  console.log(`Analysis mode: ${summary.analysisScope.mode}`);

  if (summary.analysisScope.mode === "diff") {
    console.log(
      `Changed files: ${summary.analysisScope.changedFiles.length} | Impact depth: ${summary.analysisScope.impactExpansionDepth}`,
    );
    console.log(
      `Impacted artifacts: ${summary.analysisScope.impactedArtifactIds.length} | Impacted files: ${summary.analysisScope.impactedFiles.length}`,
    );
  }

  console.log(`Total files: ${summary.totalFiles}`);
  console.log(`Total artifacts: ${summary.totalArtifacts}`);
  console.log(`Total relations: ${summary.totalRelations}`);
  console.log(`Graph nodes: ${summary.graph.nodes.length}`);
  console.log(`Graph edges: ${summary.graph.edges.length}`);
  console.log(`Total findings: ${summary.totalFindings}`);
  console.log("");
  console.log("Counts by kind:");

  for (const [kind, count] of Object.entries(summary.byKind)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log("");
  console.log("Artifact counts:");

  for (const [kind, count] of Object.entries(summary.artifactCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log("");
  console.log("Relation counts:");

  for (const [kind, count] of Object.entries(summary.relationCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log("");
  console.log("Finding counts:");

  for (const [kind, count] of Object.entries(summary.findingCounts)) {
    console.log(`- ${kind}: ${count}`);
  }

  console.log("");
  console.log("Sample files:");

  for (const file of summary.files.slice(0, 12)) {
    console.log(`- [${file.kind}] ${file.path}`);
  }

  if (summary.files.length > 12) {
    console.log(`- ... ${summary.files.length - 12} additional files`);
  }

  if (summary.artifacts.length > 0) {
    console.log("");
    console.log("Sample artifacts:");

    for (const artifact of summary.artifacts.slice(0, 8)) {
      if (artifact.kind === "nestjs_controller") {
        console.log(
          `- [controller] ${artifact.className} -> ${artifact.basePath || "/"}`,
        );
        continue;
      }

      if (artifact.kind === "nestjs_endpoint") {
        console.log(
          `- [endpoint] ${artifact.method} ${artifact.fullPath} -> ${artifact.handlerName}`,
        );
        continue;
      }

      if (artifact.kind === "angular_http_call") {
        console.log(
          `- [angular] ${artifact.method} ${artifact.normalizedPath ?? artifact.urlExpression} -> ${artifact.memberName}`,
        );
        continue;
      }

      if (artifact.kind === "package_script") {
        console.log(`- [script] ${artifact.scriptName} -> ${artifact.command}`);
        continue;
      }

      if (artifact.kind === "env_usage") {
        console.log(
          `- [env:usage] ${artifact.variableName} -> ${artifact.accessPattern}`,
        );
        continue;
      }

      if (artifact.kind === "env_definition") {
        console.log(`- [env:def] ${artifact.variableName}`);
        continue;
      }

      console.log(
        `- [readme:${artifact.referenceKind}] ${artifact.value}${artifact.section ? ` (${artifact.section})` : ""}`,
      );
    }

    if (summary.artifacts.length > 8) {
      console.log(`- ... ${summary.artifacts.length - 8} additional artifacts`);
    }
  }

  if (summary.relations.length > 0) {
    console.log("");
    console.log("Sample relations:");

    for (const relation of summary.relations.slice(0, 8)) {
      console.log(
        `- [${relation.kind}] ${relation.sourceArtifactId} -> ${relation.targetArtifactId}`,
      );
    }

    if (summary.relations.length > 8) {
      console.log(`- ... ${summary.relations.length - 8} additional relations`);
    }
  }

  if (summary.findings.length > 0) {
    console.log("");
    console.log("Sample findings:");

    for (const finding of summary.findings.slice(0, 8)) {
      console.log(
        `- [${finding.severity}] ${finding.type} id=${finding.id} fingerprint=${finding.fingerprint} rule=${finding.ruleVersion} score=${finding.score.final} publishable=${finding.publishable}: ${finding.userMessage}`,
      );
    }

    if (summary.findings.length > 8) {
      console.log(`- ... ${summary.findings.length - 8} additional findings`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "scan") {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseScanOptions(args.slice(1));
  const summary = await scanRepository(options.targetPath, {
    scoring:
      typeof options.publishThreshold === "number"
        ? { publishThreshold: options.publishThreshold }
        : undefined,
    precision:
      options.changedFiles.length > 0
        ? {
            diff: {
              changedFiles: options.changedFiles,
              impactExpansionDepth: options.impactDepth,
            },
          }
        : undefined,
    semanticReview: options.semanticReviewEnabled
      ? {
          enabled: true,
          model: options.ollamaModel,
          baseUrl: options.ollamaBaseUrl,
        }
      : undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printSummary(summary);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`driftlyzer failed: ${message}`);
  process.exitCode = 1;
});
