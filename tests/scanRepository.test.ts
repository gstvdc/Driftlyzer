import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanRepository } from "../packages/core/src/index.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(TEST_DIR, "fixtures");

function fixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

describe("scanRepository", () => {
  it("returns no findings for an aligned frontend/backend/readme fixture", async () => {
    const result = await scanRepository(fixturePath("aligned"));

    expect(result.totalRelations).toBe(4);
    expect(result.totalFindings).toBe(0);
    expect(result.graph.nodes.length).toBeGreaterThan(0);
    expect(result.graph.edges.length).toBe(result.totalRelations);
    expect(result.relationCounts.angular_consumes_nest_endpoint).toBe(2);
    expect(result.relationCounts.readme_mentions_nest_endpoint).toBe(2);
  });

  it("detects route and documentation drift when frontend and README do not match the backend", async () => {
    const result = await scanRepository(fixturePath("mismatch-route-doc"));

    expect(result.findingCounts.api_contract_drift).toBe(2);
    expect(result.findingCounts.documentation_drift).toBe(1);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("/api/accounts"),
      ),
    ).toBe(true);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("GET /users"),
      ),
    ).toBe(true);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("GET /ghost"),
      ),
    ).toBe(true);
  });

  it("relates README commands and env vars to real config artifacts", async () => {
    const result = await scanRepository(fixturePath("config-aligned"));

    expect(result.totalFindings).toBe(0);
    expect(result.relationCounts.readme_mentions_package_script).toBe(1);
    expect(result.relationCounts.readme_mentions_env_var).toBe(1);
  });

  it("detects response and request shape drift for matching routes", async () => {
    const result = await scanRepository(fixturePath("shape-mismatch"));

    const apiDriftFindings = result.findings.filter(
      (finding) => finding.type === "api_contract_drift",
    );

    expect(apiDriftFindings).toHaveLength(3);
    expect(
      apiDriftFindings.filter((finding) =>
        finding.evidence.includes("Response shape mismatch"),
      ),
    ).toHaveLength(2);
    expect(
      apiDriftFindings.filter((finding) =>
        finding.evidence.includes("Request shape mismatch"),
      ),
    ).toHaveLength(1);
  });

  it("detects README command and env references that do not exist in code or config", async () => {
    const result = await scanRepository(fixturePath("docs-config-drift"));

    expect(result.totalFindings).toBe(2);
    expect(result.findingCounts.documentation_drift).toBe(1);
    expect(result.findingCounts.config_drift).toBe(1);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("npm run start:prod"),
      ),
    ).toBe(true);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("API_PUBLIC_URL"),
      ),
    ).toBe(true);
  });

  it("detects comment drift when endpoint comments describe a stale route contract", async () => {
    const result = await scanRepository(fixturePath("comment-drift"));

    expect(result.totalFindings).toBe(1);
    expect(result.findingCounts.comment_drift).toBe(1);
    expect(result.findings[0]?.evidence).toContain("POST /users");
    expect(result.findings[0]?.evidence).toContain("GET /users");
  });

  it("adds deterministic score, publishability, and user message to findings", async () => {
    const result = await scanRepository(fixturePath("mismatch-route-doc"));

    expect(result.totalFindings).toBeGreaterThan(0);

    for (const finding of result.findings) {
      expect(typeof finding.score.structural).toBe("number");
      expect(typeof finding.score.semantic).toBe("number");
      expect(typeof finding.score.diff).toBe("number");
      expect(typeof finding.score.history).toBe("number");
      expect(typeof finding.score.final).toBe("number");
      expect(typeof finding.score.threshold).toBe("number");
      expect(typeof finding.publishable).toBe("boolean");
      expect(finding.userMessage.length).toBeGreaterThan(0);
    }
  });

  it("emits stable finding contract v1 fields for future compatibility", async () => {
    const result = await scanRepository(fixturePath("mismatch-route-doc"));

    expect(result.findingSchemaVersion).toBe("finding.v1");
    expect(result.compatibleFindingSchemaVersions).toContain("finding.v1");

    for (const finding of result.findings) {
      expect(finding.schemaVersion).toBe("finding.v1");
      expect(finding.id.startsWith("finding.v1:")).toBe(true);
      expect(finding.ruleVersion.includes("@1.0.0")).toBe(true);
      expect(finding.fingerprint.length).toBeGreaterThan(10);
      expect(Array.isArray(finding.relatedArtifactIds)).toBe(true);
      expect(Array.isArray(finding.relatedArtifacts)).toBe(true);
      expect(finding.relatedArtifacts.length).toBe(
        finding.relatedArtifactIds.length,
      );
    }
  });

  it("supports diff analysis mode and filters findings to impacted scope", async () => {
    const result = await scanRepository(fixturePath("mismatch-route-doc"), {
      precision: {
        diff: {
          changedFiles: ["frontend/src/app/accounts.service.ts"],
          impactExpansionDepth: 2,
        },
      },
    });

    expect(result.analysisScope.mode).toBe("diff");
    expect(result.totalFindings).toBe(1);
    expect(result.findings[0]?.evidence).toContain("/api/accounts");
  });

  it("expands impact over relations when scanning by diff", async () => {
    const result = await scanRepository(fixturePath("shape-mismatch"), {
      precision: {
        diff: {
          changedFiles: ["backend/src/users/users.controller.ts"],
          impactExpansionDepth: 2,
        },
      },
    });

    expect(result.analysisScope.mode).toBe("diff");
    expect(result.totalFindings).toBe(3);
    expect(result.analysisScope.impactedArtifactIds.length).toBeGreaterThan(0);
  });

  it("applies optional semantic reviewer to explain drift and improve suggested message", async () => {
    const result = await scanRepository(fixturePath("comment-drift"), {
      semanticReview: {
        enabled: true,
        onlyFindingTypes: ["comment_drift"],
        reviewer: {
          provider: "custom",
          model: "mock-semantic-reviewer",
          review: async () => ({
            semanticAssessment: "contradictory",
            explanation:
              "O comentario cita POST /users, mas o metodo implementado e GET /users.",
            suggestedFix: "Atualizar comentario para GET /users.",
            userMessage:
              "Comentario desatualizado detectado: atualize para GET /users para refletir o codigo real.",
          }),
        },
      },
    });

    expect(result.totalFindings).toBe(1);
    expect(result.findings[0]?.semanticReview?.provider).toBe("custom");
    expect(result.findings[0]?.semanticReview?.semanticAssessment).toBe(
      "contradictory",
    );
    expect(result.findings[0]?.userMessage).toContain(
      "Comentario desatualizado detectado",
    );
    expect(result.findings[0]?.suggestedFix).toContain("GET /users");
  });

  it("detects method mismatch as contract drift on both consumer and provider", async () => {
    const result = await scanRepository(fixturePath("method-mismatch"));

    expect(result.findingCounts.api_contract_drift).toBe(2);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("POST /api/users"),
      ),
    ).toBe(true);
    expect(
      result.findings.some((finding) =>
        finding.evidence.includes("GET /users"),
      ),
    ).toBe(true);
  });

  it("relates README path-only endpoint references without creating false positives", async () => {
    const result = await scanRepository(fixturePath("readme-path-only"));

    expect(result.totalFindings).toBe(0);
    expect(result.relationCounts.readme_mentions_nest_endpoint).toBe(1);
  });

  it("does not flag comment drift when comment and implementation are aligned", async () => {
    const result = await scanRepository(fixturePath("comment-aligned"));

    expect(result.totalFindings).toBe(0);
    expect(result.findingCounts.comment_drift).toBe(0);
  });

  it("detects command drift when README script does not exist", async () => {
    const result = await scanRepository(fixturePath("script-mismatch-only"));

    expect(result.totalFindings).toBe(1);
    expect(result.findingCounts.documentation_drift).toBe(1);
    expect(result.findings[0]?.evidence).toContain("pnpm dev:api");
  });
});
