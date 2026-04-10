import { createSign } from "node:crypto";

import type { RepositoryScanSummary } from "@drift/shared";

export type GitHubPullRequestWebhookPayload = {
  action: string;
  repository: {
    full_name: string;
  };
  installation?: {
    id: number;
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

export type GitHubAppInstallationAuth = {
  appId: string;
  installationId: number;
  privateKey: string;
  apiBaseUrl?: string;
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

export function buildGitHubAppJwt(input: {
  appId: string;
  privateKey: string;
  now?: Date;
}): string {
  const nowEpochSeconds = Math.floor(
    (input.now?.getTime() ?? Date.now()) / 1000,
  );
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    iat: nowEpochSeconds - 60,
    exp: nowEpochSeconds + 9 * 60,
    iss: input.appId,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");

  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(normalizePrivateKey(input.privateKey));
  return `${signingInput}.${toBase64Url(signature)}`;
}

export async function createGitHubAppInstallationToken(
  input: GitHubAppInstallationAuth,
): Promise<string> {
  const apiBaseUrl = input.apiBaseUrl ?? "https://api.github.com";
  const jwt = buildGitHubAppJwt({
    appId: input.appId,
    privateKey: input.privateKey,
  });
  const url = `${apiBaseUrl}/app/installations/${input.installationId}/access_tokens`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      "User-Agent": "driftlyzer",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `GitHub App token request failed: ${response.status} ${message}`,
    );
  }

  const payload = (await response.json()) as {
    token?: string;
  };

  if (!payload.token) {
    throw new Error("GitHub App token response missing token");
  }

  return payload.token;
}

export async function postPullRequestCommentWithGitHubApp(input: {
  auth: GitHubAppInstallationAuth;
  target: PullRequestCommentTarget;
  body: string;
}): Promise<void> {
  const token = await createGitHubAppInstallationToken(input.auth);

  await postPullRequestComment({
    token,
    target: input.target,
    body: input.body,
    apiBaseUrl: input.auth.apiBaseUrl,
  });
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();

  if (trimmed.includes("\\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }

  return trimmed;
}

function toBase64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;

  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
