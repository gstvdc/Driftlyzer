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

type DashboardSection =
  | "overview"
  | "findings"
  | "repositories"
  | "coverage"
  | "settings";

type AppState = {
  feed: FindingsReportFeedItem[];
  reportCache: Map<string, PersistedFindingsReport>;
  selectedJobId: string | null;
  selectedRepository: string;
  selectedFindingId: string | null;
  loadingFeed: boolean;
  loadingReport: boolean;
  error: string | null;
  filters: Filters;
  language: DashboardLanguage;
  activeSection: DashboardSection;
};

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

const appRoot = rootElement;

const DASHBOARD_LANGUAGE_STORAGE_KEY = "driftlyzer.dashboard.language";
const DASHBOARD_LOGO_SRC = "/logo.png";
const ALL_REPOSITORIES_VALUE = "__all_repositories__";
const SCROLL_PANEL_CLASSES =
  "max-h-[420px] overflow-y-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.45)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#334155] hover:[&::-webkit-scrollbar-thumb]:bg-[#3B82F6]";

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
  selectedRepository: ALL_REPOSITORIES_VALUE,
  selectedFindingId: null,
  loadingFeed: false,
  loadingReport: false,
  error: null,
  language: initialLanguage,
  activeSection: "overview",
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
    noGraphContext:
      "Selecione uma execução para visualizar a distribuição por área.",
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
    noGraphContext:
      "Selecciona una ejecución para ver la distribución por área.",
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
    noGraphContext:
      "Selectionnez une execution pour voir la repartition par domaine.",
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

function repositoryLabelForFeedItem(item: FindingsReportFeedItem): string {
  return item.repositoryFullName ?? item.repositoryPath;
}

function ensureSelectedRepository(): void {
  if (state.selectedRepository === ALL_REPOSITORIES_VALUE) {
    return;
  }

  const repositories = new Set(state.feed.map(repositoryLabelForFeedItem));

  if (!repositories.has(state.selectedRepository)) {
    state.selectedRepository = ALL_REPOSITORIES_VALUE;
  }
}

function getVisibleFeed(): FindingsReportFeedItem[] {
  if (state.selectedRepository === ALL_REPOSITORIES_VALUE) {
    return state.feed;
  }

  return state.feed.filter(
    (item) => repositoryLabelForFeedItem(item) === state.selectedRepository,
  );
}

function ensureSelectedJobWithinVisibleFeed(): void {
  const visibleFeed = getVisibleFeed();
  const hasSelectedJob = visibleFeed.some(
    (item) => item.jobId === state.selectedJobId,
  );

  if (!hasSelectedJob) {
    state.selectedJobId = visibleFeed[0]?.jobId ?? null;
    state.selectedFindingId = null;
  }
}

function listRepositoryOptions(messages: DashboardMessages): Array<{
  value: string;
  label: string;
}> {
  const repositories = [
    ...new Set(state.feed.map(repositoryLabelForFeedItem)),
  ].sort((left, right) => left.localeCompare(right));

  return [
    {
      value: ALL_REPOSITORIES_VALUE,
      label: messages.allRepositories,
    },
    ...repositories.map((repository) => ({
      value: repository,
      label: repository,
    })),
  ];
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
    ensureSelectedRepository();
    ensureSelectedJobWithinVisibleFeed();

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
  ensureSelectedRepository();
  ensureSelectedJobWithinVisibleFeed();

  const report = getSelectedReport();
  const findings = getFilteredFindings(report);
  const selectedFinding = findings.find(
    (finding) => finding.id === state.selectedFindingId,
  );
  const visibleFeed = getVisibleFeed();
  const totalFindings = visibleFeed.reduce(
    (sum, item) => sum + item.findings,
    0,
  );
  const totalPublishable = visibleFeed.reduce(
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
    visibleFeed.find((item) => item.jobId === state.selectedJobId) ?? null;
  const visualCopy = getVisualCopy(state.language);
  const messages = getDashboardMessages(state.language);
  const repositoryOptions = listRepositoryOptions(messages);
  const syncTone = resolveSyncTone(
    selectedFeedItem?.status,
    Boolean(state.error),
  );
  const syncLabel = state.error
    ? state.error
    : selectedFeedItem
      ? messages.statusLabels[selectedFeedItem.status]
      : messages.ready;
  const activeRepository =
    state.selectedRepository === ALL_REPOSITORIES_VALUE
      ? messages.allRepositories
      : state.selectedRepository;
  const activeAnalysisMode = selectedFeedItem
    ? messages.analysisModeLabels[selectedFeedItem.analysisMode]
    : messages.allLabel;
  const activeStatus = selectedFeedItem
    ? messages.statusLabels[selectedFeedItem.status]
    : messages.ready;

  appRoot.className = "min-h-screen bg-[#0B0F14] p-2 text-[#E5E7EB] md:p-3";

  document.title = `Driftlyzer - ${messages.title}`;

  appRoot.innerHTML = `
    <div class="mx-auto grid w-[min(1860px,98vw)] grid-cols-1 gap-5 xl:grid-cols-[252px_minmax(0,1fr)]">
      <aside class="rounded-xl border border-white/[0.08] bg-[#0F172A] p-5 xl:sticky xl:top-3 xl:min-h-[calc(100vh-1.5rem)]">
        <div class="flex h-full flex-col gap-5">
          <div>
            <p class="m-0 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]"><span class="h-px w-3 bg-current/80"></span>${escapeHtml(messages.missionControl)}</p>
            <div class="mt-3 w-full max-w-[194px]" aria-hidden="true">
              <img
                class="block h-auto max-h-[104px] w-full object-contain object-left"
                src="${escapeHtml(DASHBOARD_LOGO_SRC)}"
                alt=""
                loading="eager"
                decoding="async"
              />
            </div>
            <h1 class="mt-3 font-sans text-[1.55rem] font-semibold tracking-[-0.02em] text-[#F3F4F6]">Driftlyzer</h1>
            <p class="mt-2 max-w-[29ch] text-sm leading-6 text-[#9CA3AF]">${escapeHtml(visualCopy.tagline)}</p>
            <div class="${syncIndicatorClasses(syncTone)}">
              <span class="inline-block h-2 w-2 rounded-full bg-current"></span>
              <span>${escapeHtml(visualCopy.syncState)}: ${escapeHtml(syncLabel)}</span>
            </div>
          </div>

          <nav class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            ${renderNavItem("overview", visualCopy.navOverview, state.activeSection)}
            ${renderNavItem("findings", visualCopy.navFindings, state.activeSection)}
            ${renderNavItem("repositories", visualCopy.navRepositories, state.activeSection)}
            ${renderNavItem("coverage", visualCopy.navRules, state.activeSection)}
            ${renderNavItem("settings", visualCopy.navSettings, state.activeSection)}
          </nav>

          <div class="mt-auto grid gap-3">
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.language)}
              <select id="language-select" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderLanguageOptions(state.language)}
              </select>
            </label>
          </div>
        </div>
      </aside>

      <main class="grid min-w-0 gap-5">
        <header data-dashboard-section="overview" class="rounded-xl border border-white/[0.08] bg-[#111827] p-5">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
            <div>
              <p class="m-0 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]"><span class="h-px w-3 bg-current/80"></span>${escapeHtml(messages.title)}</p>
              <h2 class="mt-3 max-w-[68ch] text-[clamp(1.05rem,1.3vw,1.2rem)] font-semibold leading-7 text-[#CBD5E1]">${escapeHtml(messages.subtitle)}</h2>
              <div class="mt-4 flex flex-wrap items-center gap-2">
                <span class="inline-flex max-w-full items-center rounded-lg border border-white/[0.06] bg-[#0B1220] px-2.5 py-1 text-xs text-[#CBD5E1]">${escapeHtml(messages.repository)}: <span class="ml-1 max-w-[38ch] truncate">${escapeHtml(activeRepository)}</span></span>
                <span class="inline-flex items-center rounded-lg border border-white/[0.06] bg-[#0B1220] px-2.5 py-1 text-xs text-[#9CA3AF]">${escapeHtml(messages.scope)}: ${escapeHtml(activeAnalysisMode)}</span>
                ${
                  selectedFeedItem
                    ? `<span class="${statusPillClasses(selectedFeedItem.status)}">${escapeHtml(visualCopy.status)}: ${escapeHtml(activeStatus)}</span>`
                    : `<span class="inline-flex items-center rounded-lg border border-white/[0.06] bg-[#0B1220] px-2.5 py-1 text-xs text-[#9CA3AF]">${escapeHtml(visualCopy.status)}: ${escapeHtml(activeStatus)}</span>`
                }
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-1">
              <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
                ${escapeHtml(messages.repository)}
                <select id="repository-select" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                  ${renderRepositoryOptions(repositoryOptions, state.selectedRepository)}
                </select>
              </label>
              <button id="refresh-feed" class="min-h-10 rounded-xl border border-white/[0.05] bg-[#0F172A] px-4 text-sm font-semibold text-[#E5E7EB] transition-all duration-200 ease-out hover:border-[#6366F1]/45 hover:bg-[#6366F1]/10 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30">${escapeHtml(messages.refresh)}</button>
            </div>
          </div>
        </header>

        <section data-dashboard-section="overview" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article class="rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.driftScore)}</span>
            <strong class="mt-2 block text-[2.5rem] font-semibold leading-none text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${Math.round(driftScore * 100)}%</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${reportFindings.length} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.criticalIssues)}</span>
            <strong class="mt-2 block text-[2.5rem] font-semibold leading-none text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${criticalIssues}</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${totalFindings} ${escapeHtml(messages.findings)}</p>
          </article>
          <article class="rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">${escapeHtml(visualCopy.lastScan)}</span>
            <strong class="mt-2 block text-xl font-semibold leading-6 text-[#F3F4F6] [font-variant-numeric:tabular-nums]">${escapeHtml(lastScan)}</strong>
            <p class="mt-2 text-sm text-[#9CA3AF]">${totalPublishable} ${escapeHtml(messages.publishable)}</p>
          </article>
        </section>

        <section data-dashboard-section="findings" class="rounded-xl border border-white/[0.06] bg-[#111827] p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.findingsTable)}</h3>
            <span class="text-xs text-[#9CA3AF]">${findings.length}</span>
          </div>
          <div class="mb-4 grid gap-3 md:grid-cols-[0.92fr_0.92fr_1.2fr_auto]">
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.severity)}
              <select id="filter-severity" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderSeverityOptions(state.filters.severity, messages)}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.type)}
              <select id="filter-type" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30">
                ${renderTypeOptions(state.filters.type, messages)}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs text-[#9CA3AF]">
              ${escapeHtml(messages.search)}
              <input id="filter-search" type="search" class="min-h-10 rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB] outline-none transition placeholder:text-[#9CA3AF]/80 focus:border-[#6366F1]/80 focus:ring-2 focus:ring-[#6366F1]/30" placeholder="${escapeHtml(
                messages.searchPlaceholder,
              )}" value="${escapeHtml(state.filters.search)}" />
            </label>
            <label class="inline-flex min-h-10 items-center gap-2 self-end rounded-xl border border-white/10 bg-[#0F172A] px-3 text-sm text-[#E5E7EB]">
              <input id="filter-publishable" type="checkbox" class="h-4 w-4 accent-[#6366F1]" ${
                state.filters.publishableOnly ? "checked" : ""
              } />
              ${escapeHtml(messages.publishableOnly)}
            </label>
          </div>
          <div class="overflow-auto rounded-xl border border-white/[0.05] bg-[#0F172A] [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.45)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#334155] hover:[&::-webkit-scrollbar-thumb]:bg-[#3B82F6]">
            ${renderFindingsTable(findings, messages, visualCopy)}
          </div>
        </section>

        <section data-dashboard-section="repositories" class="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.18fr)_minmax(0,1fr)]">
          <article class="min-w-0 rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.repositoriesPanel)}</h3>
              <span class="text-xs text-[#9CA3AF]">${visibleFeed.length}</span>
            </div>
            <div class="${SCROLL_PANEL_CLASSES}">
              ${renderReportsList(visibleFeed, messages)}
            </div>
          </article>

          <article class="min-w-0 rounded-xl border border-white/[0.08] bg-[rgba(255,255,255,0.02)] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14] ${
            selectedFinding && findingHealthTone(selectedFinding) === "critical"
              ? "border-[#EF4444]/45"
              : "border-[#6366F1]/30"
          }">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.selectedFinding)}</h3>
              <span class="text-xs text-[#9CA3AF]">${
                selectedFinding
                  ? severityLabel(selectedFinding.severity, messages)
                  : "-"
              }</span>
            </div>
            <div class="${SCROLL_PANEL_CLASSES}">
              ${renderFindingDetail(selectedFinding, report, messages)}
            </div>
          </article>

          <article data-dashboard-section="coverage" class="min-w-0 rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14] xl:col-span-2 2xl:col-span-1">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.serviceGraph)}</h3>
              <span class="text-xs text-[#9CA3AF]">${escapeHtml(visualCopy.graphHint)}</span>
            </div>
            ${renderServiceGraph(report, selectedFinding)}
          </article>
        </section>

        <section data-dashboard-section="findings" class="grid gap-5 xl:grid-cols-2">
          <article class="min-w-0 rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.diffViewer)}</h3>
            </div>
            ${renderDiffViewer(selectedFinding, visualCopy)}
          </article>

          <article class="min-w-0 rounded-xl border border-white/[0.06] bg-[#111827] p-5 transition-colors duration-200 ease-out hover:border-white/[0.14]">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.codeBlock)}</h3>
            </div>
            ${renderFindingCodeBlock(selectedFinding, visualCopy)}
          </article>
        </section>

        <section data-dashboard-section="settings" class="rounded-xl border border-white/[0.06] bg-[#111827] p-5">
          <h3 class="m-0 text-base font-semibold text-[#F3F4F6]">${escapeHtml(visualCopy.navSettings)}</h3>
          <p class="mt-2 text-sm leading-6 text-[#9CA3AF]">${escapeHtml(messages.ready)} ${escapeHtml(messages.language)}: ${escapeHtml(LANGUAGE_OPTIONS.find((option) => option.code === state.language)?.label ?? state.language)}.</p>
          <p class="mt-2 text-sm leading-6 text-[#9CA3AF]">${escapeHtml(messages.repository)}: ${escapeHtml(activeRepository)}.</p>
        </section>

        <footer class="rounded-xl border px-3 py-2 text-xs ${
          state.error
            ? "border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]"
            : "border-white/10 bg-[#0F172A] text-[#CBD5E1]"
        }">
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

function renderReportsList(
  feedItems: FindingsReportFeedItem[],
  messages: DashboardMessages,
): string {
  if (state.loadingFeed && feedItems.length === 0) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.fetchingReports)}</p>`;
  }

  if (feedItems.length === 0) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.noFeed)}</p>`;
  }

  return feedItems
    .map((item) => {
      const selected = item.jobId === state.selectedJobId ? "selected" : "";
      const repo = item.repositoryFullName ?? item.repositoryPath;

      return `
        <button class="w-full rounded-xl border px-3 py-3 text-left transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-[#6366F1]/35 ${reportItemClasses(selected)}" data-report-id="${escapeHtml(item.jobId)}">
          <div class="flex items-start justify-between gap-2">
            <strong class="break-all text-sm font-semibold text-[#F3F4F6]">${escapeHtml(repo)}</strong>
            <span class="${statusPillClasses(item.status)}">${escapeHtml(messages.statusLabels[item.status])}</span>
          </div>
          <p class="mt-2 text-xs text-[#9CA3AF]">#${item.pullRequestNumber ?? escapeHtml(messages.reportLocalLabel)} • ${escapeHtml(messages.analysisModeLabels[item.analysisMode])}</p>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-lg font-semibold text-[#F3F4F6]">${item.findings}</span>
            <small class="text-xs text-[#9CA3AF]">${item.publishableFindings} ${escapeHtml(messages.reportPublishedShort)}</small>
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
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.selectReport)}</p>`;
  }

  if (state.loadingReport && !getSelectedReport()) {
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.loadingReport)}</p>`;
  }

  if (findings.length === 0) {
    return `<p class="px-3 py-2 text-sm text-[#9CA3AF]">${escapeHtml(messages.noFindingsForFilters)}</p>`;
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

      return `
        <tr class="${findingRowClasses(selected, tone)}" data-finding-id="${escapeHtml(finding.id)}" tabindex="0" role="button">
          <td class="px-3 py-3"><span class="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-2 py-1 text-[11px] font-semibold leading-none text-[#CBD5E1]">${escapeHtml(messages.typeLabels[finding.type])}</span></td>
          <td class="px-3 py-3"><span class="${severityBadgeClasses(finding.severity)}">${severityLabel(finding.severity, messages)}</span></td>
          <td class="px-3 py-3 font-mono text-xs [font-variant-numeric:tabular-nums] text-[#CBD5E1]">${finding.score.final.toFixed(2)}</td>
          <td class="px-3 py-3 font-mono text-xs [font-variant-numeric:tabular-nums] text-[#CBD5E1]">${escapeHtml(finding.file)}</td>
          <td class="px-3 py-3"><span class="${statusBadgeClasses(tone)}">${escapeHtml(statusLabel)}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="w-full min-w-[690px] border-collapse">
      <thead>
        <tr>
          <th class="sticky top-0 z-[1] border-b border-white/[0.04] bg-[#0F172A] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.type)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/[0.04] bg-[#0F172A] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.severity)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/[0.04] bg-[#0F172A] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">Score</th>
          <th class="sticky top-0 z-[1] border-b border-white/[0.04] bg-[#0F172A] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(visualCopy.file)}</th>
          <th class="sticky top-0 z-[1] border-b border-white/[0.04] bg-[#0F172A] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(visualCopy.status)}</th>
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
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(messages.chooseFinding)}</p>`;
  }

  const scope = report.summary.analysisScope;
  const scopeSummary =
    scope.mode === "diff"
      ? `${messages.analysisModeLabels.diff} • ${scope.changedFiles.length} ${messages.changed} • ${messages.depth} ${scope.impactExpansionDepth}`
      : messages.analysisModeLabels.full;

  return `
    <section class="mb-4 border-b border-white/10 pb-4">
      <h3 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.typeLabels[finding.type])} • ${severityLabel(finding.severity, messages)}</h3>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${escapeHtml(finding.evidence)}</p>
    </section>
    <section class="mb-4 grid gap-3 border-b border-white/10 pb-4 sm:grid-cols-2">
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.id)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.id)}</code></div>
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.fingerprint)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.fingerprint)}</code></div>
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.rule)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.ruleVersion)}</code></div>
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.schema)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${escapeHtml(finding.schemaVersion)}</code></div>
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.scope)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${escapeHtml(scopeSummary)}</code></div>
      <div class="min-w-0 grid gap-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2"><span class="text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(messages.publishable)}</span><code class="block w-full break-all whitespace-normal font-mono text-xs text-[#C7D2FE]">${finding.publishable ? escapeHtml(messages.publishableYes) : escapeHtml(messages.publishableNo)}</code></div>
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.scoreBreakdown)}</h4>
      ${renderScoreMeter("structural", finding.score.structural, messages)}
      ${renderScoreMeter("semantic", finding.score.semantic, messages)}
      ${renderScoreMeter("diff", finding.score.diff, messages)}
      ${renderScoreMeter("history", finding.score.history, messages)}
      ${renderScoreMeter("final", finding.score.final, messages, finding.score.threshold)}
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.paths)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.primary)}:</strong> ${escapeHtml(finding.file)}</p>
      <p class="mt-1 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.related)}:</strong> ${escapeHtml(finding.relatedFile ?? "-")}</p>
      <p class="mt-1 text-sm leading-6 text-[#CBD5E1]"><strong class="font-semibold text-[#E5E7EB]">${escapeHtml(messages.artifacts)}:</strong> ${escapeHtml(
        finding.relatedArtifactIds.join(", "),
      )}</p>
    </section>
    <section class="mb-4 border-b border-white/10 pb-4">
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.suggestedFix)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${escapeHtml(finding.suggestedFix ?? messages.noSuggestion)}</p>
    </section>
    <section>
      <h4 class="text-sm font-semibold text-[#F3F4F6]">${escapeHtml(messages.semanticAssist)}</h4>
      <p class="mt-2 text-sm leading-6 text-[#CBD5E1]">${
        finding.semanticReview
          ? `${escapeHtml(finding.semanticReview.model)} • ${escapeHtml(
              finding.semanticReview.semanticAssessment,
            )} • ${escapeHtml(finding.semanticReview.explanation)}`
          : escapeHtml(messages.noSemanticReview)
      }</p>
    </section>
  `;
}

function renderNavItem(
  section: DashboardSection,
  label: string,
  activeSection: DashboardSection,
): string {
  const activeClasses =
    section === activeSection
      ? "border-[#6366F1]/45 bg-[#6366F1]/12 text-[#F3F4F6]"
      : "border-white/[0.08] bg-transparent text-[#E5E7EB] hover:border-white/20 hover:bg-white/[0.03]";

  return `<button class="min-h-10 rounded-lg border px-3 text-left text-sm font-medium transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[#6366F1]/35 ${activeClasses}" type="button" data-nav-section="${escapeHtml(section)}">${escapeHtml(label)}</button>`;
}

function syncIndicatorClasses(tone: "critical" | "warning" | "ok"): string {
  const base =
    "mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium";

  if (tone === "critical") {
    return `${base} border-[#EF4444]/30 bg-[#EF4444]/8 text-[#FCA5A5]`;
  }

  if (tone === "warning") {
    return `${base} border-[#F59E0B]/30 bg-[#F59E0B]/8 text-[#FCD34D]`;
  }

  return `${base} border-[#22C55E]/28 bg-[#22C55E]/8 text-[#86EFAC]`;
}

function reportItemClasses(selected: string): string {
  if (selected) {
    return "border-[#6366F1]/45 bg-[#6366F1]/10";
  }

  return "border-white/[0.08] bg-[#0F172A] hover:border-white/20 hover:bg-white/[0.03]";
}

function statusPillClasses(status: PersistedScanJob["status"]): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]";

  if (status === "completed") {
    return `${base} border-[#22C55E]/28 bg-[#22C55E]/8 text-[#86EFAC]`;
  }

  if (status === "failed") {
    return `${base} border-[#EF4444]/30 bg-[#EF4444]/8 text-[#FCA5A5]`;
  }

  return `${base} border-[#F59E0B]/28 bg-[#F59E0B]/8 text-[#FCD34D]`;
}

function findingRowClasses(
  selected: string,
  tone: "critical" | "warning" | "ok",
): string {
  const selectedClasses = selected
    ? "bg-[#6366F1]/10"
    : "hover:bg-white/[0.03]";
  const toneClasses =
    tone === "critical" ? "border-l border-l-[#EF4444]/45" : "";

  return `cursor-pointer border-b border-white/[0.05] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/35 ${selectedClasses} ${toneClasses}`;
}

function severityBadgeClasses(severity: Severity): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none";

  if (severity === "critical") {
    return `${base} border-[#EF4444]/32 bg-[#EF4444]/10 text-[#FCA5A5]`;
  }

  if (severity === "high") {
    return `${base} border-[#F59E0B]/32 bg-[#F59E0B]/10 text-[#FCD34D]`;
  }

  if (severity === "medium") {
    return `${base} border-[#F59E0B]/24 bg-[#F59E0B]/8 text-[#FDE68A]`;
  }

  return `${base} border-white/12 bg-white/[0.03] text-[#CBD5E1]`;
}

function statusBadgeClasses(tone: "critical" | "warning" | "ok"): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-current";

  if (tone === "critical") {
    return `${base} border-[#EF4444]/30 bg-[#EF4444]/8 text-[#FCA5A5]`;
  }

  if (tone === "warning") {
    return `${base} border-[#F59E0B]/30 bg-[#F59E0B]/8 text-[#FCD34D]`;
  }

  return `${base} border-[#22C55E]/28 bg-[#22C55E]/8 text-[#86EFAC]`;
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
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(visualCopy.noDiffContext)}</p>`;
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
    <pre class="m-0 max-h-[320px] overflow-auto rounded-xl border border-white/[0.08] bg-[#0B1220] p-3 font-mono text-xs leading-6 text-[#DBE3EF]">${lines
      .map(
        (line) =>
          `<span class="block rounded px-0.5 ${diffLineClasses(line.tone)}">${escapeHtml(line.text)}</span>`,
      )
      .join("")}</pre>
  `;
}

function renderFindingCodeBlock(
  finding: Finding | undefined,
  visualCopy: DashboardVisualCopy,
): string {
  if (!finding) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(visualCopy.noCodeContext)}</p>`;
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

  return `<pre class="m-0 max-h-[320px] overflow-auto rounded-xl border border-white/[0.08] bg-[#0B1220] p-3 font-mono text-xs leading-6 text-[#DBE3EF]">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function renderServiceGraph(
  report: PersistedFindingsReport | null,
  selectedFinding: Finding | undefined,
): string {
  if (!report) {
    return `<p class="py-1 text-sm text-[#9CA3AF]">${escapeHtml(getVisualCopy(state.language).noGraphContext)}</p>`;
  }

  const counts = report.summary.findingCounts;
  const activePosition = selectedFinding
    ? graphPositionByFindingType(selectedFinding.type)
    : null;
  const positions: Record<ServiceGraphNode, { x: number; y: number }> = {
    api: { x: 50, y: 24 },
    docs: { x: 18, y: 50 },
    config: { x: 82, y: 50 },
    tests: { x: 34, y: 80 },
    comments: { x: 66, y: 80 },
  };
  const edges: Array<[ServiceGraphNode, ServiceGraphNode]> = [
    ["api", "docs"],
    ["api", "config"],
    ["docs", "tests"],
    ["config", "comments"],
    ["tests", "comments"],
  ];
  const edgeMarkup = edges
    .map(([from, to]) => {
      const fromPos = positions[from];
      const toPos = positions[to];
      const isActive =
        activePosition !== null &&
        (from === activePosition || to === activePosition);

      return `<line x1="${fromPos.x}" y1="${fromPos.y}" x2="${toPos.x}" y2="${toPos.y}" stroke="${
        isActive ? "rgba(99, 102, 241, 0.45)" : "rgba(148, 163, 184, 0.25)"
      }" stroke-width="1.3" stroke-linecap="round"></line>`;
    })
    .join("");

  return `
    <div class="relative mt-1 h-[276px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B1220] [background-image:linear-gradient(rgba(148,163,184,0.04)_1px,_transparent_1px),linear-gradient(90deg,_rgba(148,163,184,0.04)_1px,_transparent_1px)] [background-size:36px_36px]">
      <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${edgeMarkup}
      </svg>
      ${renderGraphNode("API", counts.api_contract_drift, "api", activePosition === "api")}
      ${renderGraphNode("Docs", counts.documentation_drift, "docs", activePosition === "docs")}
      ${renderGraphNode("Config", counts.config_drift, "config", activePosition === "config")}
      ${renderGraphNode("Tests", counts.test_drift, "tests", activePosition === "tests")}
      ${renderGraphNode("Comments", counts.comment_drift, "comments", activePosition === "comments")}
    </div>
  `;
}

type ServiceGraphNode = "api" | "docs" | "config" | "tests" | "comments";

function graphPositionByFindingType(type: DriftType): ServiceGraphNode {
  switch (type) {
    case "api_contract_drift":
      return "api";
    case "documentation_drift":
      return "docs";
    case "config_drift":
      return "config";
    case "test_drift":
      return "tests";
    case "comment_drift":
      return "comments";
  }
}

function renderGraphNode(
  label: string,
  count: number,
  position: ServiceGraphNode,
  isActive: boolean,
): string {
  const positionClasses: Record<ServiceGraphNode, string> = {
    api: "left-1/2 top-[10%] -translate-x-1/2",
    docs: "left-[2.5%] top-[38%]",
    config: "right-[2.5%] top-[38%]",
    tests: "bottom-[6%] left-[22%]",
    comments: "bottom-[6%] right-[22%]",
  };
  const toneClasses =
    count > 0
      ? "border-[#F59E0B]/28 bg-[#111827]"
      : "border-white/20 bg-[#0F172A]";
  const activeClasses = isActive ? "border-[#6366F1]/55 bg-[#6366F1]/12" : "";

  return `
    <div class="absolute min-w-[94px] rounded-lg border px-3 py-2 text-center text-xs text-[#E5E7EB] transition-colors duration-150 ease-out hover:border-white/30 ${positionClasses[position]} ${toneClasses} ${activeClasses}">
      <strong class="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">${escapeHtml(label)}</strong>
      <span class="text-sm font-semibold">${count}</span>
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
    <div class="mt-2">
      <span class="text-[11px] font-mono text-[#CBD5E1]">${escapeHtml(messages.scoreLabels[label])} ${score.toFixed(2)}${escapeHtml(thresholdLabel)}</span>
      <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-500/25">
        <div class="h-full rounded-full bg-[#6366F1] transition-all duration-200 ease-out w-[${pct}%]"></div>
      </div>
    </div>
  `;
}

function diffLineClasses(tone: "ctx" | "add" | "del"): string {
  if (tone === "add") {
    return "bg-[#22C55E]/10 text-[#86EFAC]";
  }

  if (tone === "del") {
    return "bg-[#EF4444]/10 text-[#FCA5A5]";
  }

  return "text-[#B3C0D1]";
}

function bindEvents(): void {
  const languageSelect =
    document.querySelector<HTMLSelectElement>("#language-select");
  const repositorySelect =
    document.querySelector<HTMLSelectElement>("#repository-select");
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

  repositorySelect?.addEventListener("change", () => {
    state.selectedRepository = repositorySelect.value;
    ensureSelectedRepository();
    ensureSelectedJobWithinVisibleFeed();

    if (state.selectedJobId) {
      void loadReport(state.selectedJobId);
      return;
    }

    ensureSelectedFinding();
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
    .querySelectorAll<HTMLButtonElement>("[data-nav-section]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.dataset.navSection as
          | DashboardSection
          | undefined;

        if (!section) {
          return;
        }

        state.activeSection = section;
        render();

        requestAnimationFrame(() => {
          const target = document.querySelector<HTMLElement>(
            `[data-dashboard-section="${section}"]`,
          );

          target?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
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

function renderRepositoryOptions(
  options: Array<{ value: string; label: string }>,
  selected: string,
): string {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${
          option.value === selected ? "selected" : ""
        }>${escapeHtml(option.label)}</option>`,
    )
    .join("");
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
