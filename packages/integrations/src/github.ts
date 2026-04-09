import type { RepositoryScanSummary } from "@drift/shared";

export type GitHubPullRequestWebhookPayload = {
  action: string;
  repository: {
    full_name: string;
  };
  pull_request: {
    number: number;
    head: {
      sha: string;
    };
    base: {
      sha: string;
    };
  };
};

export type PullRequestCommentTarget = {
  owner: string;
  repo: string;
  pullNumber: number;
};

export function parseRepositoryFullName(fullName: string): {
  owner: string;
  repo: string;
} {
  const [owner, repo] = fullName.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid repository full name: ${fullName}`);
  }

  return { owner, repo };
}

export function buildDriftlyzerPullRequestComment(
  summary: RepositoryScanSummary,
): string {
  const publishableFindings = summary.findings.filter(
    (finding) => finding.publishable,
  );
  const sampleFindings = (
    publishableFindings.length > 0 ? publishableFindings : summary.findings
  ).slice(0, 8);

  const lines = [
    "## Driftlyzer Report",
    "",
    `- Findings: ${summary.totalFindings}`,
    `- Publishable: ${publishableFindings.length}`,
    `- Schema: ${summary.findingSchemaVersion}`,
    `- Scope: ${summary.analysisScope.mode}`,
    "",
  ];

  if (summary.analysisScope.mode === "diff") {
    lines.push(
      `- Changed files: ${summary.analysisScope.changedFiles.length}`,
      `- Impacted files: ${summary.analysisScope.impactedFiles.length}`,
      "",
    );
  }

  if (sampleFindings.length === 0) {
    lines.push("Nenhum drift relevante detectado neste PR.");
    return lines.join("\n");
  }

  lines.push("### Top Findings", "");

  for (const finding of sampleFindings) {
    lines.push(
      `- [${finding.severity}] ${finding.type} (${finding.id})`,
      `  - score: ${finding.score.final} | publishable: ${finding.publishable}`,
      `  - mensagem: ${finding.userMessage}`,
    );
  }

  return lines.join("\n");
}

export async function postPullRequestComment(input: {
  token: string;
  target: PullRequestCommentTarget;
  body: string;
  apiBaseUrl?: string;
}): Promise<void> {
  const apiBaseUrl = input.apiBaseUrl ?? "https://api.github.com";
  const url = `${apiBaseUrl}/repos/${input.target.owner}/${input.target.repo}/issues/${input.target.pullNumber}/comments`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "User-Agent": "driftlyzer",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ body: input.body }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub comment failed: ${response.status} ${message}`);
  }
}
