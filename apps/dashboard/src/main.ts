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
const DASHBOARD_LOGO_SRC = "/logo.png";

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

type DashboardVisualCopy = {
  tagline: string;
  navOverview: string;
  navFindings: string;
  navRepositories: string;
  navRules: string;
  navSettings: string;
  driftScore: string;
  criticalIssues: string;
  lastScan: string;
  syncState: string;
  findingsTable: string;
  repositoriesPanel: string;
  selectedFinding: string;
  serviceGraph: string;
  diffViewer: string;
  codeBlock: string;
  file: string;
  status: string;
  statusCritical: string;
  statusWarning: string;
  statusOk: string;
  noDiffContext: string;
  noCodeContext: string;
  noGraphContext: string;
  graphHint: string;
};

const DASHBOARD_VISUAL_COPY: Record<DashboardLanguage, DashboardVisualCopy> = {
  "pt-BR": {
    tagline: "Contratos, documentação e configuração em uma leitura só.",
    navOverview: "Resumo",
    navFindings: "Achados",
    navRepositories: "Execuções",
    navRules: "Cobertura",
    navSettings: "Ajustes",
    driftScore: "Índice de consistência",
    criticalIssues: "Achados críticos",
    lastScan: "Última análise",
    syncState: "Atualização",
    findingsTable: "Lista de achados",
    repositoriesPanel: "Execuções recentes",
    selectedFinding: "Detalhe do achado",
    serviceGraph: "Panorama por área",
    diffViewer: "Mudança relacionada",
    codeBlock: "Resumo técnico",
    file: "Arquivo",
    status: "Status",
    statusCritical: "Crítico",
    statusWarning: "Atenção",
    statusOk: "Saudável",
    noDiffContext: "Selecione um finding para visualizar o diff contextual.",
    noCodeContext: "Selecione um finding para visualizar o resumo técnico.",
    noGraphContext: "Selecione uma execução para visualizar a distribuição por área.",
    graphHint: "Leitura resumida por domínio.",
  },
  en: {
    tagline: "Contracts, docs, and config in one clear view.",
    navOverview: "Overview",
    navFindings: "Findings",
    navRepositories: "Runs",
    navRules: "Coverage",
    navSettings: "Settings",
    driftScore: "Consistency Index",
    criticalIssues: "Critical Findings",
    lastScan: "Last Review",
    syncState: "Sync",
    findingsTable: "Findings List",
    repositoriesPanel: "Recent Runs",
    selectedFinding: "Finding Detail",
    serviceGraph: "Area Overview",
    diffViewer: "Related Change",
    codeBlock: "Technical Summary",
    file: "File",
    status: "Status",
    statusCritical: "Critical",
    statusWarning: "Attention",
    statusOk: "Healthy",
    noDiffContext: "Select a finding to inspect contextual diff.",
    noCodeContext: "Select a finding to inspect the technical summary.",
    noGraphContext: "Select a run to inspect the area breakdown.",
    graphHint: "Compact domain-level overview.",
  },
  es: {
    tagline: "Contratos, docs y configuración en una sola vista.",
    navOverview: "Resumen",
    navFindings: "Hallazgos",
    navRepositories: "Ejecuciones",
    navRules: "Cobertura",
    navSettings: "Ajustes",
    driftScore: "Índice de consistencia",
    criticalIssues: "Hallazgos críticos",
    lastScan: "Último análisis",
    syncState: "Actualización",
    findingsTable: "Tabla de Hallazgos",
    repositoriesPanel: "Ejecuciones recientes",
    selectedFinding: "Detalle del hallazgo",
    serviceGraph: "Panorama por área",
    diffViewer: "Cambio relacionado",
    codeBlock: "Resumen técnico",
    file: "Archivo",
    status: "Estado",
    statusCritical: "Crítico",
    statusWarning: "Atención",
    statusOk: "Saludable",
    noDiffContext: "Selecciona un hallazgo para ver el diff contextual.",
    noCodeContext: "Selecciona un hallazgo para ver el resumen técnico.",
    noGraphContext: "Selecciona una ejecución para ver la distribución por área.",
    graphHint: "Lectura resumida por dominio.",
  },
  fr: {
    tagline: "Contrats, docs et configuration dans une vue claire.",
    navOverview: "Vue générale",
    navFindings: "Constats",
    navRepositories: "Exécutions",
    navRules: "Couverture",
    navSettings: "Réglages",
    driftScore: "Indice de cohérence",
    criticalIssues: "Constats critiques",
    lastScan: "Dernière analyse",
    syncState: "Mise à jour",
    findingsTable: "Table des Constats",
    repositoriesPanel: "Exécutions récentes",
    selectedFinding: "Détail du constat",
    serviceGraph: "Vue par domaine",
    diffViewer: "Changement lié",
    codeBlock: "Résumé technique",
    file: "Fichier",
    status: "Statut",
    statusCritical: "Critique",
    statusWarning: "Attention",
    statusOk: "Stable",
    noDiffContext: "Selectionnez un constat pour voir le diff contextuel.",
    noCodeContext: "Selectionnez un constat pour voir le resume technique.",
    noGraphContext: "Selectionnez une execution pour voir la repartition par domaine.",
    graphHint: "Lecture resumee par domaine.",
  },
};

function getVisualCopy(language: DashboardLanguage): DashboardVisualCopy {
  return (
    DASHBOARD_VISUAL_COPY[language] ?? DASHBOARD_VISUAL_COPY[DEFAULT_LANGUAGE]
  );
}

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
  const reportFindings = report?.summary.findings ?? [];
  const driftScore =
    reportFindings.length > 0
      ? reportFindings.reduce((sum, finding) => sum + finding.score.final, 0) /
        reportFindings.length
      : 0;
  const criticalIssues = reportFindings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const lastScan = report
    ? formatTimestamp(report.producedAt, state.language)
    : "-";
  const selectedFeedItem =
    state.feed.find((item) => item.jobId === state.selectedJobId) ?? null;
  const visualCopy = getVisualCopy(state.language);
  const messages = getDashboardMessages(state.language);
  const syncTone = resolveSyncTone(
    selectedFeedItem?.status,
    Boolean(state.error),
  );
  const syncLabel = state.error
    ? state.error
    : selectedFeedItem
      ? messages.statusLabels[selectedFeedItem.status]
      : messages.ready;

  document.title = `Driftlyzer - ${messages.title}`;

  appRoot.innerHTML = `
    <div class="grid-backdrop"></div>
    <div class="shell">
      <aside class="sidebar reveal">
        <div class="brand-block">
          <p class="kicker">${escapeHtml(messages.missionControl)}</p>
          <div class="brand-logo" aria-hidden="true">
            <img
              class="brand-logo-image"
              src="${escapeHtml(DASHBOARD_LOGO_SRC)}"
              alt=""
              loading="eager"
              decoding="async"
            />
          </div>
          <h1>Driftlyzer</h1>
          <p class="brand-subtitle">${escapeHtml(visualCopy.tagline)}</p>
          <div class="status-indicator tone-${syncTone}">
            <span class="status-dot"></span>
            <span>${escapeHtml(visualCopy.syncState)}: ${escapeHtml(syncLabel)}</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          ${renderNavItem(visualCopy.navOverview, true)}
          ${renderNavItem(visualCopy.navFindings)}
          ${renderNavItem(visualCopy.navRepositories)}
          ${renderNavItem(visualCopy.navRules)}
          ${renderNavItem(visualCopy.navSettings)}
        </nav>

        <div class="sidebar-actions">
          <label>
            ${escapeHtml(messages.language)}
            <select id="language-select">
              ${renderLanguageOptions(state.language)}
            </select>
          </label>
          <button id="refresh-feed" class="ghost">${escapeHtml(messages.refresh)}</button>
        </div>
      </aside>

      <main class="dashboard-main">
        <header class="card top-header reveal">
          <p class="kicker">${escapeHtml(messages.title)}</p>
          <h2>${escapeHtml(messages.subtitle)}</h2>
        </header>

        <section class="metrics-grid reveal">
          <article class="card metric-card">
            <span class="metric-label">${escapeHtml(visualCopy.driftScore)}</span>
            <strong>${Math.round(driftScore * 100)}%</strong>
            <p>${reportFindings.length} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="card metric-card">
            <span class="metric-label">${escapeHtml(visualCopy.criticalIssues)}</span>
            <strong>${criticalIssues}</strong>
            <p>${totalFindings} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="card metric-card">
            <span class="metric-label">${escapeHtml(visualCopy.lastScan)}</span>
            <strong class="metric-timestamp">${escapeHtml(lastScan)}</strong>
            <p>${totalPublishable} ${escapeHtml(messages.publishable)}</p>
          </article>
        </section>

        <section class="card table-card reveal">
          <div class="card-head">
            <h3>${escapeHtml(visualCopy.findingsTable)}</h3>
            <span>${findings.length}</span>
          </div>
          <div class="filters">
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
            <label class="checkbox-inline">
              <input id="filter-publishable" type="checkbox" ${
                state.filters.publishableOnly ? "checked" : ""
              } />
              ${escapeHtml(messages.publishableOnly)}
            </label>
          </div>
          <div class="table-wrap">
            ${renderFindingsTable(findings, messages, visualCopy)}
          </div>
        </section>

        <section class="bottom-grid">
          <article class="card repos-panel reveal">
            <div class="card-head">
              <h3>${escapeHtml(visualCopy.repositoriesPanel)}</h3>
              <span>${state.feed.length}</span>
            </div>
            <div class="report-list">
              ${renderReportsList(messages)}
            </div>
          </article>

          <article class="card detail-panel reveal ${
            selectedFinding && findingHealthTone(selectedFinding) === "critical"
              ? "drift-highlight"
              : ""
          }">
            <div class="card-head">
              <h3>${escapeHtml(visualCopy.selectedFinding)}</h3>
              <span>${
                selectedFinding
                  ? severityLabel(selectedFinding.severity, messages)
                  : "-"
              }</span>
            </div>
            <div class="detail-content">
              ${renderFindingDetail(selectedFinding, report, messages)}
            </div>
          </article>

          <article class="card graph-panel reveal">
            <div class="card-head">
              <h3>${escapeHtml(visualCopy.serviceGraph)}</h3>
              <span>${escapeHtml(visualCopy.graphHint)}</span>
            </div>
            ${renderServiceGraph(report)}
          </article>
        </section>

        <section class="support-grid reveal">
          <article class="card diff-panel">
            <div class="card-head">
              <h3>${escapeHtml(visualCopy.diffViewer)}</h3>
            </div>
            ${renderDiffViewer(selectedFinding, visualCopy)}
          </article>

          <article class="card code-panel">
            <div class="card-head">
              <h3>${escapeHtml(visualCopy.codeBlock)}</h3>
            </div>
            ${renderFindingCodeBlock(selectedFinding, visualCopy)}
          </article>
        </section>

        <footer class="status ${state.error ? "error" : ""}">
          ${
            state.loadingFeed || state.loadingReport
              ? escapeHtml(messages.loadingData)
              : state.error
                ? escapeHtml(state.error)
                : escapeHtml(messages.ready)
          }
        </footer>
      </main>
    </div>
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
          <div class="report-top">
            <strong>${escapeHtml(repo)}</strong>
            <span class="status-pill ${item.status}">${escapeHtml(messages.statusLabels[item.status])}</span>
          </div>
          <p class="report-meta">#${item.pullRequestNumber ?? escapeHtml(messages.reportLocalLabel)} • ${escapeHtml(messages.analysisModeLabels[item.analysisMode])}</p>
          <div class="report-counts">
            <span>${item.findings}</span>
            <small>${item.publishableFindings} ${escapeHtml(messages.reportPublishedShort)}</small>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderFindingsTable(
  findings: Finding[],
  messages: DashboardMessages,
  visualCopy: DashboardVisualCopy,
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

  const rows = findings
    .map((finding) => {
      const selected = finding.id === state.selectedFindingId ? "selected" : "";
      const tone = findingHealthTone(finding);
      const statusLabel =
        tone === "critical"
          ? visualCopy.statusCritical
          : tone === "warning"
            ? visualCopy.statusWarning
            : visualCopy.statusOk;
      const driftGlow = tone === "critical" ? "drift-glow" : "";

      return `
        <tr class="finding-table-row ${selected} ${driftGlow}" data-finding-id="${escapeHtml(finding.id)}" tabindex="0" role="button">
          <td><span class="badge neutral">${escapeHtml(messages.typeLabels[finding.type])}</span></td>
          <td><span class="badge severity-${finding.severity}">${severityLabel(finding.severity, messages)}</span></td>
          <td class="mono">${finding.score.final.toFixed(2)}</td>
          <td class="mono">${escapeHtml(finding.file)}</td>
          <td><span class="status-badge tone-${tone}">${escapeHtml(statusLabel)}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="findings-table">
      <thead>
        <tr>
          <th>${escapeHtml(messages.type)}</th>
          <th>${escapeHtml(messages.severity)}</th>
          <th>Score</th>
          <th>${escapeHtml(visualCopy.file)}</th>
          <th>${escapeHtml(visualCopy.status)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
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

function renderNavItem(label: string, active = false): string {
  return `<button class="nav-item ${active ? "active" : ""}" type="button">${escapeHtml(label)}</button>`;
}

function findingHealthTone(finding: Finding): "critical" | "warning" | "ok" {
  if (finding.severity === "critical" || finding.severity === "high") {
    return "critical";
  }

  if (finding.severity === "medium") {
    return "warning";
  }

  return "ok";
}

function resolveSyncTone(
  status: PersistedScanJob["status"] | undefined,
  hasError: boolean,
): "critical" | "warning" | "ok" {
  if (hasError || status === "failed") {
    return "critical";
  }

  if (status === "processing" || status === "pending") {
    return "warning";
  }

  return "ok";
}

function formatTimestamp(value: string, language: DashboardLanguage): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function renderDiffViewer(
  finding: Finding | undefined,
  visualCopy: DashboardVisualCopy,
): string {
  if (!finding) {
    return `<p class="empty">${escapeHtml(visualCopy.noDiffContext)}</p>`;
  }

  const relatedPath = finding.relatedFile ?? "docs/contract.md";
  const lines: Array<{
    tone: "ctx" | "add" | "del";
    text: string;
  }> = [
    {
      tone: "ctx",
      text: `@@ ${relatedPath} -> ${finding.file} @@`,
    },
    {
      tone: "del",
      text: `- ${relatedPath}: ${finding.evidence}`,
    },
    {
      tone: "add",
      text: `+ ${finding.file}: ${finding.userMessage}`,
    },
  ];

  return `
    <pre class="diff-viewer">${lines
      .map(
        (line) =>
          `<span class="diff-line ${line.tone}">${escapeHtml(line.text)}</span>`,
      )
      .join("")}</pre>
  `;
}

function renderFindingCodeBlock(
  finding: Finding | undefined,
  visualCopy: DashboardVisualCopy,
): string {
  if (!finding) {
    return `<p class="empty">${escapeHtml(visualCopy.noCodeContext)}</p>`;
  }

  const payload = {
    id: finding.id,
    fingerprint: finding.fingerprint,
    type: finding.type,
    severity: finding.severity,
    score: finding.score,
    publishable: finding.publishable,
    file: finding.file,
    relatedFile: finding.relatedFile,
    relatedArtifacts: finding.relatedArtifacts,
  };

  return `<pre class="code-block">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function renderServiceGraph(report: PersistedFindingsReport | null): string {
  if (!report) {
    return `<p class="empty">${escapeHtml(getVisualCopy(state.language).noGraphContext)}</p>`;
  }

  const counts = report.summary.findingCounts;

  return `
    <div class="service-graph">
      <span class="graph-edge edge-api"></span>
      <span class="graph-edge edge-docs"></span>
      <span class="graph-edge edge-config"></span>
      <span class="graph-edge edge-tests"></span>
      ${renderGraphNode("API", counts.api_contract_drift, "node-api")}
      ${renderGraphNode("Docs", counts.documentation_drift, "node-docs")}
      ${renderGraphNode("Config", counts.config_drift, "node-config")}
      ${renderGraphNode("Tests", counts.test_drift, "node-tests")}
      ${renderGraphNode("Comments", counts.comment_drift, "node-comments")}
    </div>
  `;
}

function renderGraphNode(
  label: string,
  count: number,
  className: string,
): string {
  return `
    <div class="graph-node ${className} ${count > 0 ? "hot" : "ok"}">
      <strong>${escapeHtml(label)}</strong>
      <span>${count}</span>
    </div>
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
    .querySelectorAll<HTMLElement>("[data-finding-id]")
    .forEach((item) => {
      const selectFinding = (): void => {
        const findingId = item.dataset.findingId;

        if (!findingId) {
          return;
        }

        state.selectedFindingId = findingId;
        render();
      };

      item.addEventListener("click", selectFinding);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectFinding();
        }
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
