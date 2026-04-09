import type {
  DriftSeverity,
  DriftType,
  SemanticAssessment,
} from "@drift/shared";

export type SemanticReviewInput = {
  finding: {
    type: DriftType;
    severity: DriftSeverity;
    file: string;
    relatedFile?: string;
    evidence: string;
    suggestedFix?: string;
    userMessage: string;
  };
};

export type SemanticReviewResult = {
  semanticAssessment: SemanticAssessment;
  explanation: string;
  suggestedFix: string | null;
  userMessage: string;
};

export type SemanticReviewer = {
  provider: "ollama" | "custom";
  model: string;
  review: (input: SemanticReviewInput) => Promise<SemanticReviewResult | null>;
};

export type OllamaSemanticReviewerOptions = {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
};

export function createOllamaSemanticReviewer(
  options: OllamaSemanticReviewerOptions = {},
): SemanticReviewer {
  const model = options.model ?? "llama3";
  const baseUrl =
    options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const timeoutMs = options.timeoutMs ?? 12_000;

  return {
    provider: "ollama",
    model,
    review: async (input) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: false,
            format: "json",
            options: {
              temperature: options.temperature ?? 0.1,
            },
            prompt: buildPrompt(input),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as {
          response?: string;
        };

        return parseSemanticReviewResult(payload.response);
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function buildPrompt(input: SemanticReviewInput): string {
  return [
    "You are a code consistency reviewer.",
    "Analyze whether the reported drift evidence is semantically consistent with a real mismatch.",
    "Return JSON only with this shape:",
    '{"semanticAssessment":"aligned|contradictory|uncertain","explanation":"string","suggestedFix":"string or null","userMessage":"string"}',
    "Keep the userMessage concise, practical, and in Portuguese.",
    "Finding context:",
    JSON.stringify(input.finding, null, 2),
  ].join("\n");
}

function parseSemanticReviewResult(
  rawResponse: string | undefined,
): SemanticReviewResult | null {
  if (!rawResponse) {
    return null;
  }

  const parsed = tryParseObject(rawResponse);

  if (!parsed) {
    return null;
  }

  const semanticAssessment = normalizeSemanticAssessment(
    parsed.semanticAssessment,
  );
  const explanation = toNonEmptyString(parsed.explanation);
  const suggestedFix = toNullableString(parsed.suggestedFix);
  const userMessage = toNonEmptyString(parsed.userMessage);

  if (!semanticAssessment || !explanation || !userMessage) {
    return null;
  }

  return {
    semanticAssessment,
    explanation,
    suggestedFix,
    userMessage,
  };
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;

    return isRecord(value) ? value : null;
  } catch {
    const objectMatch = raw.match(/\{[\s\S]*\}/);

    if (!objectMatch) {
      return null;
    }

    try {
      const value = JSON.parse(objectMatch[0]) as unknown;

      return isRecord(value) ? value : null;
    } catch {
      return null;
    }
  }
}

function normalizeSemanticAssessment(
  value: unknown,
): SemanticAssessment | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "aligned" ||
    normalized === "contradictory" ||
    normalized === "uncertain"
  ) {
    return normalized;
  }

  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
