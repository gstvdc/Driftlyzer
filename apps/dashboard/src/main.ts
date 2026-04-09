import "./styles.css";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  getDashboardMessages,
  type DashboardLanguage,
  type DashboardMessages,
} from "./languages";

type Severity = "critical" | "high" | "medium" | "low";
type DriftType =
  | "comment_drift"
  | "documentation_drift"
  | "api_contract_drift"
  | "config_drift"
  | "test_drift";

type AnalysisScope =
  | {
      mode: "full";
    }
  | {
      mode: "diff";
      changedFiles: string[];
      impactExpansionDepth: number;
      impactedArtifactIds: string[];
      impactedFiles: string[];
    };

type PersistedScanJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "processing" | "completed" | "failed";
  repositoryPath: string;
  changedFiles: string[];
  repositoryFullName?: string;
  pullRequestNumber?: number;
  deliveryId?: string;
};

type FindingScore = {
  structural: number;
  semantic: number;
  diff: number;
  history: number;
  final: number;
  threshold: number;
};

type FindingRelatedArtifact = {
  artifactId: string;
  role: "primary" | "secondary" | "context";
};

type SemanticReview = {
  provider: string;
  model: string;
  explanation: string;
  semanticAssessment: "aligned" | "contradictory" | "uncertain";
  suggestedFix: string | null;
  userMessage: string;
};

type Finding = {
  id: string;
  schemaVersion: string;
  ruleVersion: string;
  fingerprint: string;
  type: DriftType;
  severity: Severity;
  confidence: number;
  score: FindingScore;
  publishable: boolean;
  userMessage: string;
  file: string;
  relatedFile?: string;
  relatedArtifactIds: string[];
  relatedArtifacts: FindingRelatedArtifact[];
  evidence: string;
  suggestedFix?: string;
  semanticReview?: SemanticReview;
};

type RepositoryScanSummary = {
  findingSchemaVersion: string;
  analysisScope: AnalysisScope;
  rootPath: string;
  scannedAt: string;
  totalFindings: number;
  findingCounts: Record<DriftType, number>;
  findings: Finding[];
};

type PersistedFindingsReport = {
  job: PersistedScanJob;
  producedAt: string;
  summary: RepositoryScanSummary;
  pullRequestCommentBody: string;
};

type FindingsReportFeedItem = {
  jobId: string;
  producedAt: string;
  repositoryPath: string;
  repositoryFullName?: string;
  pullRequestNumber?: number;
  findings: number;
  publishableFindings: number;
  analysisMode: "full" | "diff";
  findingSchemaVersion: string;
  status: PersistedScanJob["status"];
};

type FindingsFeedResponse = {
  totalReports: number;
  reports: FindingsReportFeedItem[];
};

type Filters = {
  severity: "all" | Severity;
  type: "all" | DriftType;
  publishableOnly: boolean;
  search: string;
};

type AppState = {
  feed: FindingsReportFeedItem[];
  reportCache: Map<string, PersistedFindingsReport>;
  selectedJobId: string | null;
  selectedFindingId: string | null;
  loadingFeed: boolean;
  loadingReport: boolean;
  error: string | null;
  filters: Filters;
  language: DashboardLanguage;
};

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

const appRoot = rootElement;

const DASHBOARD_LANGUAGE_STORAGE_KEY = "driftlyzer.dashboard.language";

function isDashboardLanguage(value: string): value is DashboardLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

function readInitialLanguage(): DashboardLanguage {
  try {
    const saved = localStorage.getItem(DASHBOARD_LANGUAGE_STORAGE_KEY);

    if (saved && isDashboardLanguage(saved)) {
      return saved;
    }
  } catch {
    // Ignore localStorage read errors and fallback to default language.
  }

  return DEFAULT_LANGUAGE;
}

function persistLanguage(language: DashboardLanguage): void {
  try {
    localStorage.setItem(DASHBOARD_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore localStorage write errors.
  }
}

function applyDocumentLanguage(language: DashboardLanguage): void {
  document.documentElement.lang = language;
}

const initialLanguage = readInitialLanguage();
applyDocumentLanguage(initialLanguage);

const state: AppState = {
  feed: [],
  reportCache: new Map(),
  selectedJobId: null,
  selectedFindingId: null,
  loadingFeed: false,
  loadingReport: false,
  error: null,
  language: initialLanguage,
  filters: {
    severity: "all",
    type: "all",
    publishableOnly: false,
    search: "",
  },
};

void boot();

async function boot(): Promise<void> {
  await loadFeed();
}

async function loadFeed(): Promise<void> {
  state.loadingFeed = true;
  state.error = null;
  render();

  try {
    const response = await fetch("/findings/reports");

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as FindingsFeedResponse;
    state.feed = payload.reports;

    if (!state.selectedJobId && state.feed.length > 0) {
      state.selectedJobId = state.feed[0]?.jobId ?? null;
    }

    if (state.selectedJobId) {
      await loadReport(state.selectedJobId);
    }
  } catch (error: unknown) {
    const messages = getDashboardMessages(state.language);
    const message = error instanceof Error ? error.message : "Unknown error";
    state.error = `${messages.feedLoadErrorPrefix}: ${message}`;
  } finally {
    state.loadingFeed = false;
    render();
  }
}

async function loadReport(jobId: string): Promise<void> {
  if (state.reportCache.has(jobId)) {
    ensureSelectedFinding();
    render();
    return;
  }

  state.loadingReport = true;
  state.error = null;
  render();

  try {
    const response = await fetch(
      `/findings/reports/${encodeURIComponent(jobId)}`,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const report = (await response.json()) as PersistedFindingsReport;
    state.reportCache.set(jobId, report);
    ensureSelectedFinding();
  } catch (error: unknown) {
    const messages = getDashboardMessages(state.language);
    const message = error instanceof Error ? error.message : "Unknown error";
    state.error = `${messages.reportLoadErrorPrefix} ${jobId}: ${message}`;
  } finally {
    state.loadingReport = false;
    render();
  }
}

function getSelectedReport(): PersistedFindingsReport | null {
  if (!state.selectedJobId) {
    return null;
  }

  return state.reportCache.get(state.selectedJobId) ?? null;
}

function getFilteredFindings(
  report: PersistedFindingsReport | null,
): Finding[] {
  if (!report) {
    return [];
  }

  return report.summary.findings.filter((finding) => {
    if (
      state.filters.severity !== "all" &&
      finding.severity !== state.filters.severity
    ) {
      return false;
    }

    if (state.filters.type !== "all" && finding.type !== state.filters.type) {
      return false;
    }

    if (state.filters.publishableOnly && !finding.publishable) {
      return false;
    }

    if (!state.filters.search.trim()) {
      return true;
    }

    const query = state.filters.search.trim().toLowerCase();
    const haystack = [
      finding.id,
      finding.evidence,
      finding.userMessage,
      finding.file,
      finding.relatedFile ?? "",
      finding.fingerprint,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function ensureSelectedFinding(): void {
  const report = getSelectedReport();
  const findings = getFilteredFindings(report);

  if (findings.length === 0) {
    state.selectedFindingId = null;
    return;
  }

  const currentlySelected = findings.some(
    (finding) => finding.id === state.selectedFindingId,
  );

  if (!currentlySelected) {
    state.selectedFindingId = findings[0]?.id ?? null;
  }
}

function render(): void {
  const report = getSelectedReport();
  const findings = getFilteredFindings(report);
  const selectedFinding = findings.find(
    (finding) => finding.id === state.selectedFindingId,
  );
  const totalFindings = state.feed.reduce(
    (sum, item) => sum + item.findings,
    0,
  );
  const totalPublishable = state.feed.reduce(
    (sum, item) => sum + item.publishableFindings,
    0,
  );
  const highestRisk = findings.reduce(
    (max, finding) => Math.max(max, finding.score.final),
    0,
  );
  const messages = getDashboardMessages(state.language);

  document.title = `Driftlyzer - ${messages.title}`;

  appRoot.innerHTML = `
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>
    <main class="layout">
      <header class="hero reveal">
        <p class="kicker">${escapeHtml(messages.missionControl)}</p>
        <h1>${escapeHtml(messages.title)}</h1>
        <p class="subtitle">${escapeHtml(messages.subtitle)}</p>
        <div class="hero-stats">
          <article class="metric">
            <span class="metric-label">${escapeHtml(messages.reports)}</span>
            <strong>${state.feed.length}</strong>
          </article>
          <article class="metric">
            <span class="metric-label">${escapeHtml(messages.findings)}</span>
            <strong>${totalFindings}</strong>
          </article>
          <article class="metric">
            <span class="metric-label">${escapeHtml(messages.publishable)}</span>
            <strong>${totalPublishable}</strong>
          </article>
          <article class="metric">
            <span class="metric-label">${escapeHtml(messages.peakRisk)}</span>
            <strong>${highestRisk.toFixed(2)}</strong>
          </article>
        </div>
      </header>

      <section class="controls reveal">
        <label>
          ${escapeHtml(messages.language)}
          <select id="language-select">
            ${renderLanguageOptions(state.language)}
          </select>
        </label>
        <label>
          ${escapeHtml(messages.severity)}
          <select id="filter-severity">
            ${renderSeverityOptions(state.filters.severity, messages)}
          </select>
        </label>
        <label>
          ${escapeHtml(messages.type)}
          <select id="filter-type">
            ${renderTypeOptions(state.filters.type, messages)}
          </select>
        </label>
        <label>
          ${escapeHtml(messages.search)}
          <input id="filter-search" type="search" placeholder="${escapeHtml(
            messages.searchPlaceholder,
          )}" value="${escapeHtml(state.filters.search)}" />
        </label>
        <label class="checkbox-row">
          <input id="filter-publishable" type="checkbox" ${
            state.filters.publishableOnly ? "checked" : ""
          } />
          ${escapeHtml(messages.publishableOnly)}
        </label>
        <button id="refresh-feed" class="ghost">${escapeHtml(messages.refresh)}</button>
      </section>

      <section class="panels">
        <article class="panel reveal">
          <div class="panel-head">
            <h2>${escapeHtml(messages.reports)}</h2>
            <span>${state.feed.length}</span>
          </div>
          <div class="report-list">
            ${renderReportsList(messages)}
          </div>
        </article>

        <article class="panel reveal">
          <div class="panel-head">
            <h2>${escapeHtml(messages.findings)}</h2>
            <span>${findings.length}</span>
          </div>
          <div class="finding-list">
            ${renderFindingsList(findings, messages)}
          </div>
        </article>

        <article class="panel detail reveal">
          <div class="panel-head">
            <h2>${escapeHtml(messages.details)}</h2>
            <span>${selectedFinding ? severityLabel(selectedFinding.severity, messages) : "-"}</span>
          </div>
          <div class="detail-content">
            ${renderFindingDetail(selectedFinding, report, messages)}
          </div>
        </article>
      </section>

      <footer class="status ${state.error ? "error" : ""}">
        ${state.loadingFeed || state.loadingReport ? escapeHtml(messages.loadingData) : state.error ? escapeHtml(state.error) : escapeHtml(messages.ready)}
      </footer>
    </main>
  `;

  bindEvents();
}

function renderReportsList(messages: DashboardMessages): string {
  if (state.loadingFeed && state.feed.length === 0) {
    return `<p class="empty">${escapeHtml(messages.fetchingReports)}</p>`;
  }

  if (state.feed.length === 0) {
    return `<p class="empty">${escapeHtml(messages.noFeed)}</p>`;
  }

  return state.feed
    .map((item, index) => {
      const selected = item.jobId === state.selectedJobId ? "selected" : "";
      const repo = item.repositoryFullName ?? item.repositoryPath;

      return `
        <button class="report-item ${selected}" data-report-id="${escapeHtml(item.jobId)}" style="--stagger:${index}">
          <div>
            <strong>${escapeHtml(repo)}</strong>
            <p>#${item.pullRequestNumber ?? escapeHtml(messages.reportLocalLabel)} • ${escapeHtml(messages.analysisModeLabels[item.analysisMode])} • ${escapeHtml(messages.statusLabels[item.status])}</p>
          </div>
          <div class="report-counts">
            <span>${item.findings}</span>
            <small>${item.publishableFindings} ${escapeHtml(messages.reportPublishedShort)}</small>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderFindingsList(
  findings: Finding[],
  messages: DashboardMessages,
): string {
  if (!state.selectedJobId) {
    return `<p class="empty">${escapeHtml(messages.selectReport)}</p>`;
  }

  if (state.loadingReport && !getSelectedReport()) {
    return `<p class="empty">${escapeHtml(messages.loadingReport)}</p>`;
  }

  if (findings.length === 0) {
    return `<p class="empty">${escapeHtml(messages.noFindingsForFilters)}</p>`;
  }

  return findings
    .map((finding, index) => {
      const selected = finding.id === state.selectedFindingId ? "selected" : "";

      return `
        <button class="finding-item ${selected}" data-finding-id="${escapeHtml(finding.id)}" style="--stagger:${index}">
          <div class="finding-row">
            <span class="badge severity-${finding.severity}">${severityLabel(finding.severity, messages)}</span>
            <span class="badge neutral">${escapeHtml(messages.typeLabels[finding.type])}</span>
            <span class="score">${finding.score.final.toFixed(2)}</span>
          </div>
          <p>${escapeHtml(finding.userMessage)}</p>
          <small>${escapeHtml(finding.file)}</small>
        </button>
      `;
    })
    .join("");
}

function renderFindingDetail(
  finding: Finding | undefined,
  report: PersistedFindingsReport | null,
  messages: DashboardMessages,
): string {
  if (!finding || !report) {
    return `<p class="empty">${escapeHtml(messages.chooseFinding)}</p>`;
  }

  const scope = report.summary.analysisScope;
  const scopeSummary =
    scope.mode === "diff"
      ? `${messages.analysisModeLabels.diff} • ${scope.changedFiles.length} ${messages.changed} • ${messages.depth} ${scope.impactExpansionDepth}`
      : messages.analysisModeLabels.full;

  return `
    <section class="detail-block">
      <h3>${escapeHtml(messages.typeLabels[finding.type])} • ${severityLabel(finding.severity, messages)}</h3>
      <p>${escapeHtml(finding.evidence)}</p>
    </section>
    <section class="detail-block mono-grid">
      <div><span>${escapeHtml(messages.id)}</span><code>${escapeHtml(finding.id)}</code></div>
      <div><span>${escapeHtml(messages.fingerprint)}</span><code>${escapeHtml(finding.fingerprint)}</code></div>
      <div><span>${escapeHtml(messages.rule)}</span><code>${escapeHtml(finding.ruleVersion)}</code></div>
      <div><span>${escapeHtml(messages.schema)}</span><code>${escapeHtml(finding.schemaVersion)}</code></div>
      <div><span>${escapeHtml(messages.scope)}</span><code>${escapeHtml(scopeSummary)}</code></div>
      <div><span>${escapeHtml(messages.publishable)}</span><code>${finding.publishable ? escapeHtml(messages.publishableYes) : escapeHtml(messages.publishableNo)}</code></div>
    </section>
    <section class="detail-block">
      <h4>${escapeHtml(messages.scoreBreakdown)}</h4>
      ${renderScoreMeter("structural", finding.score.structural, messages)}
      ${renderScoreMeter("semantic", finding.score.semantic, messages)}
      ${renderScoreMeter("diff", finding.score.diff, messages)}
      ${renderScoreMeter("history", finding.score.history, messages)}
      ${renderScoreMeter("final", finding.score.final, messages, finding.score.threshold)}
    </section>
    <section class="detail-block">
      <h4>${escapeHtml(messages.paths)}</h4>
      <p><strong>${escapeHtml(messages.primary)}:</strong> ${escapeHtml(finding.file)}</p>
      <p><strong>${escapeHtml(messages.related)}:</strong> ${escapeHtml(finding.relatedFile ?? "-")}</p>
      <p><strong>${escapeHtml(messages.artifacts)}:</strong> ${escapeHtml(
        finding.relatedArtifactIds.join(", "),
      )}</p>
    </section>
    <section class="detail-block">
      <h4>${escapeHtml(messages.suggestedFix)}</h4>
      <p>${escapeHtml(finding.suggestedFix ?? messages.noSuggestion)}</p>
    </section>
    <section class="detail-block">
      <h4>${escapeHtml(messages.semanticAssist)}</h4>
      <p>${
        finding.semanticReview
          ? `${escapeHtml(finding.semanticReview.model)} • ${escapeHtml(
              finding.semanticReview.semanticAssessment,
            )} • ${escapeHtml(finding.semanticReview.explanation)}`
          : escapeHtml(messages.noSemanticReview)
      }</p>
    </section>
  `;
}

function renderScoreMeter(
  label: keyof DashboardMessages["scoreLabels"],
  score: number,
  messages: DashboardMessages,
  threshold?: number,
): string {
  const pct = Math.round(score * 100);
  const thresholdLabel =
    typeof threshold === "number"
      ? ` • ${messages.threshold} ${threshold.toFixed(2)}`
      : "";

  return `
    <div class="meter-row">
      <span>${escapeHtml(messages.scoreLabels[label])} ${score.toFixed(2)}${escapeHtml(thresholdLabel)}</span>
      <div class="meter-track">
        <div class="meter-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function bindEvents(): void {
  const languageSelect =
    document.querySelector<HTMLSelectElement>("#language-select");
  const severitySelect =
    document.querySelector<HTMLSelectElement>("#filter-severity");
  const typeSelect = document.querySelector<HTMLSelectElement>("#filter-type");
  const searchInput =
    document.querySelector<HTMLInputElement>("#filter-search");
  const publishableInput = document.querySelector<HTMLInputElement>(
    "#filter-publishable",
  );
  const refreshButton =
    document.querySelector<HTMLButtonElement>("#refresh-feed");

  languageSelect?.addEventListener("change", () => {
    const nextLanguage = languageSelect.value;

    if (!isDashboardLanguage(nextLanguage)) {
      return;
    }

    state.language = nextLanguage;
    persistLanguage(nextLanguage);
    applyDocumentLanguage(nextLanguage);
    render();
  });

  severitySelect?.addEventListener("change", () => {
    state.filters.severity = severitySelect.value as Filters["severity"];
    ensureSelectedFinding();
    render();
  });

  typeSelect?.addEventListener("change", () => {
    state.filters.type = typeSelect.value as Filters["type"];
    ensureSelectedFinding();
    render();
  });

  searchInput?.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    ensureSelectedFinding();
    render();
  });

  publishableInput?.addEventListener("change", () => {
    state.filters.publishableOnly = publishableInput.checked;
    ensureSelectedFinding();
    render();
  });

  refreshButton?.addEventListener("click", () => {
    state.reportCache.clear();
    void loadFeed();
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-report-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const reportId = button.dataset.reportId;

        if (!reportId || reportId === state.selectedJobId) {
          return;
        }

        state.selectedJobId = reportId;
        state.selectedFindingId = null;
        void loadReport(reportId);
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-finding-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const findingId = button.dataset.findingId;

        if (!findingId) {
          return;
        }

        state.selectedFindingId = findingId;
        render();
      });
    });
}

function severityLabel(
  severity: Severity,
  messages: DashboardMessages,
): string {
  return messages.severityLabels[severity];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLanguageOptions(selected: DashboardLanguage): string {
  return LANGUAGE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.code)}" ${
        option.code === selected ? "selected" : ""
      }>${escapeHtml(option.label)}</option>`,
  ).join("");
}

function renderSeverityOptions(
  selected: Filters["severity"],
  messages: DashboardMessages,
): string {
  return [
    {
      value: "all",
      label: messages.allLabel,
    },
    {
      value: "critical",
      label: messages.severityLabels.critical,
    },
    {
      value: "high",
      label: messages.severityLabels.high,
    },
    {
      value: "medium",
      label: messages.severityLabels.medium,
    },
    {
      value: "low",
      label: messages.severityLabels.low,
    },
  ]
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}" ${
          item.value === selected ? "selected" : ""
        }>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function renderTypeOptions(
  selected: Filters["type"],
  messages: DashboardMessages,
): string {
  return [
    {
      value: "all",
      label: messages.allLabel,
    },
    {
      value: "api_contract_drift",
      label: messages.typeLabels.api_contract_drift,
    },
    {
      value: "documentation_drift",
      label: messages.typeLabels.documentation_drift,
    },
    {
      value: "comment_drift",
      label: messages.typeLabels.comment_drift,
    },
    {
      value: "config_drift",
      label: messages.typeLabels.config_drift,
    },
    {
      value: "test_drift",
      label: messages.typeLabels.test_drift,
    },
  ]
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}" ${
          item.value === selected ? "selected" : ""
        }>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}
